from datetime import datetime
import json
import os
import shutil
import tempfile
import time
from fastapi import Body, FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
import pandas as pd
from pydantic import BaseModel, Field
from typing import List
import io
import pdfplumber
from PIL import Image
import base64
from agents import OBBModule, TOCRAgent, BatchTOCRAgent
from fastapi.middleware.cors import CORSMiddleware
from io import BytesIO
from utils import convert_htm_to_excel
from openpyxl.drawing.image import Image as ExcelImage
from dotenv import load_dotenv
from starlette.background import BackgroundTask
import gspread
from google.oauth2.service_account import Credentials
from pymongo import MongoClient

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scope = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

creds = Credentials.from_service_account_file("gsheetlog-448810-ec6df9a271e8.json", scopes=scope)
client = gspread.authorize(creds)

id = '1lbBg7m9xUKPgs7QlgSeUaovPCrGnDuAiPAnrq51q-mQ'
sheet = client.open_by_key(id).worksheet("Gsheet-auto-v4")

mongo_client = MongoClient(os.environ['MONGODB_URI'])
db = mongo_client['adeos']
job_collection = db['jobs']

agent = TOCRAgent(system_prompt=open("./system_prompt.txt", 'r').read())
batch_agent = BatchTOCRAgent(system_prompt=open("./system_prompt.txt", 'r').read())
obb = OBBModule('./dynamic_quantized_21.onnx')

def get_pil_image(image):
    return Image.open(io.BytesIO(base64.b64decode(image)))

def is_table_empty(table):
    return not any(row for row in table if any(cell and cell.strip() for cell in row))

def parse_numbers(s: str):
    parts = s.split(',')
    numbers = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            start_str, end_str = part.split('-')
            start = int(start_str.strip())
            end = int(end_str.strip())
            numbers.extend(range(start, end + 1))
        else:
            numbers.append(int(part))
    return numbers

@app.post("/categorize")
async def categorize(
    selected_pages: str = Form(...), # this should a string like: '2,3,5-8'
    pdf_file: UploadFile = File(...)
):
    try:
        pdf_bytes = await pdf_file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Error reading the PDF file")
    
    selected_pages_list = parse_numbers(selected_pages)

    response = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num in selected_pages_list:
            page_index = page_num - 1  # Adjust for zero-based indexing
            if page_index < 0 or page_index >= len(pdf.pages):
                raise HTTPException(status_code=400, detail=f"Page number {page_num} out of range for the provided PDF")

            page = pdf.pages[page_index]
            # pix = page.to_image()
            # pix.save("img.png")
            # img = Image.open('img.png')
            # img1, img2 = page.to_image().original, page.to_image(resolution=275).original
            img1, img2 = page.to_image().original, page.to_image(resolution=275).original 
            obb_result = obb.detect_bbox(img1, img2)

            if obb_result['num_tables'] > 0:
                width, height = page.width, page.height

                if width >= 838 and height >= 590:
                    category = "A3"
                else:
                    tables = page.extract_tables()
                    if any(not is_table_empty(table) for table in tables):  # W or S
                        if len(page.extract_text().strip().split(' ')) > 30:  # W
                            category = "Word"
                        else:  # S
                            category = "Scanned"
                    else:  # S or EC
                        category = "Scanned"
            else:
                category = "Edge Case"

            if category == 'Word':
                for cls_id, cropped_img in obb_result.get('cropped_images', []):
                    if cls_id == 2:
                        category = "Scanned"
                        break

            response.append({
                "page_num": page_num,
                "category": category,
                # "bbox": obb_result if category != 'Word' else None,
                "bbox": obb_result,
                "dpi": 275,
            })
    return response

@app.post("/save_m_obb")
def save_m_obb(
    file_name: str = Form(...),
    pg_no: int = Form(...),
    category: str = Form(...),
):
    save_file = "/app/data/obb-traindata.json"
    new_entry = {
        "file_name": file_name,
        "pg_no": pg_no,
        "category": category
    }
    
    if os.path.exists(save_file):
        with open(save_file, "r") as json_file:
            existing_data = json.load(json_file)
    else:
        existing_data = []

    if new_entry not in existing_data:
        existing_data.append(new_entry)
        with open(save_file, "w") as json_file:
            json.dump(existing_data, json_file)
        return {"message": "Data saved successfully"}
    else:
        return {"message": "Data already exists"}

@app.post("/set_dpi")
async def set_dpi(
    dpi: int = Form(...),
    pages: str = Form(...),
    pdf_file: UploadFile = File(...)
):
    try:
        pages_data = json.loads(pages)
        print(">>> ", pages_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid pages JSON data")

    try:
        pdf_bytes = await pdf_file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Error reading the PDF file")

    results = []
    for page_info in pages_data:
        page_num = page_info.get('page_num')
        bboxes = page_info.get('bbox')
        if page_num is None or bboxes is None:
            raise HTTPException(status_code=400, detail="Each page must have 'page_num' and 'bbox'")
        
        box_data = []
        for bbox in bboxes:
            # prev_bbox = bbox
            xyxy = bbox.get('xyxy')
            xywh = bbox.get('xywh')
            class_id =bbox.get('class_id')
            with pdfplumber.open(io.BytesIO(pdf_bytes), pages=[page_num]) as pdf:
                page = pdf.pages[0]
                img1 = page.to_image(resolution=275).original
                img2 = page.to_image(resolution=dpi).original

                scale_factor_x = img2.width / img1.width
                scale_factor_y = img2.height / img1.height

                x1, y1, x2, y2 = [
                    coord * scale for coord, scale in zip(xyxy[:4], [scale_factor_x, scale_factor_y, scale_factor_x, scale_factor_y])
                ]

                x, y, w, h = [
                    coord * scale for coord, scale in zip(xywh, [scale_factor_x, scale_factor_y, scale_factor_x, scale_factor_y])
                ]

                buffered = BytesIO()
                img2.save(buffered, format="PNG")
                img2_string = base64.b64encode(buffered.getvalue()).decode('utf-8')

                box_data.append(
                    {
                        "xyxy": [x1, y1, x2, y2],
                        "xywh": [x, y, w, h],
                        "class_id": class_id#added
                    }
                )
        
        results.append({
            "page_num": page_num,
            "bbox": {
                "bbox_data": box_data,
                "actual_image": img2_string,
                "height": img2.height,
                "width": img2.width,
                "num_tables": len(bboxes)
            },
            "dpi": dpi,
        })
    return results

def calculate_cost(input_tokens, output_tokens):
    """
    Calculate the cost for using Claude 3.5 Sonnet based on input and output tokens.
    
    :param input_tokens: Number of input tokens
    :param output_tokens: Number of output tokens
    :return: Total cost in USD
    """
    # Rates per million tokens
    INPUT_RATE = 3  # $3 per million input tokens
    OUTPUT_RATE = 15  # $15 per million output tokens
    
    # Convert to millions of tokens and calculate cost
    input_cost = (input_tokens / 1_000_000) * INPUT_RATE
    output_cost = (output_tokens / 1_000_000) * OUTPUT_RATE
    
    total_cost = input_cost + output_cost
    
    return round(total_cost, 2)

@app.post("/extract")
async def extract(
    pdf_file: UploadFile = File(...),
    data: str = Form(...),
):
    temp_dir = tempfile.mkdtemp()
    print("data: ", data)

    start_time_whole_process = time.time()
    
    selected_pgs = []
    a3_pages = []
    scanned_pages = []
    word_pages = []
    edge_case_pages = []
    dpi_list = []
    a3_count = 0
    scanned_count = 0
    word_count = 0
    edge_case_count = 0
    table_count = 0
    tok_in = 0
    tok_out = 0
    
    try:
        pdf_path = os.path.join(temp_dir, pdf_file.filename)
        contents = await pdf_file.read()
        with open(pdf_path, 'wb') as f:
            f.write(contents)
        
        data = json.loads(data)
        print(data)
        excel_files_info = []
        
        with pdfplumber.open(pdf_path) as pdf:
            for page in data:
                pg_no = page['page_num']
                category = page['category']
                dpi = page['dpi']

                dpi_list.append(dpi)
                selected_pgs.append(pg_no)
                page_index = pg_no - 1  # Adjust for zero-based indexing
                if page_index < 0 or page_index >= len(pdf.pages):
                    raise HTTPException(status_code=400, detail=f"Page number {pg_no} out of range for the provided PDF")
                pl_page = pdf.pages[page_index]
                pg_image = pl_page.to_image(resolution=dpi).original
                # img_path = os.path.join(temp_dir, "img.png")
                # pg_image.save(img_path)
                # pg_image = Image.open(img_path)#hanged
        
                if category in ['A3', 'Scanned']:
                    if category == 'A3':
                        a3_count += 1
                        a3_pages.append(pg_no)
                    else:
                        scanned_count += 1
                        scanned_pages.append(pg_no)
                    
                    excel_file = os.path.join(temp_dir, f'{os.path.splitext(pdf_file.filename)[0]}_page-{pg_no}.xlsx')
                    with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
                        start_row = 0
                        tbl_count = 0
                        for tables in page['bbox']:
                            class_id = tables['class_id']
                            bbox = tables['xyxy']
                            print(">>>>bbox: ", bbox)
                            cropped_img = pg_image.crop(bbox)
                            if class_id == 2:
                                cropped_img = cropped_img.rotate(270, expand=True)
                            img_buffer = io.BytesIO()
                            cropped_img.save(f"{tbl_count}-test.png")
                            cropped_img.save(img_buffer, format="PNG")
                            img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                            
                            html_table_content, usage = agent.extract_table(img_base64, pdf_file.filename, pg_no)
                            tok_in += int(usage.input_tokens)
                            tok_out += int(usage.output_tokens)
                            for gen_table in html_table_content:
                                table_count+=1
                                gen_table = "<table" + gen_table
                                tbl_count += 1
        
                                html_file = os.path.join(temp_dir, f'file-{pdf_file.filename[:-4]}-page-{pg_no}-table-{tbl_count}.html')
                                with open(html_file, 'w', encoding='utf-8') as file:
                                    file.write(gen_table)
                                        
                                excel_file_per_table = os.path.join(temp_dir, f'file-{pdf_file.filename[:-4]}-page-{pg_no}-table-{tbl_count}.xlsx')
                                convert_htm_to_excel(html_file, excel_file_per_table)
        
                                #table_df = pd.read_excel(excel_file_per_table)
                                with pd.ExcelFile(excel_file_per_table) as xls:#changed
                                    table_df = pd.read_excel(xls)
        
                                if isinstance(table_df.columns, pd.MultiIndex):
                                    table_df.columns = [' '.join(col).strip() for col in table_df.columns.values]
        
                                table_df.to_excel(writer, index=False, header=True, startrow=start_row, sheet_name='Page Tables')
                                        
                                start_row += len(table_df) + 3
                                excel_files_info.append({
                                    'excel_file': excel_file,
                                    'page_num': pg_no,
                                    'table_num': tbl_count,
                                    'image': pl_page.to_image(resolution=95).original.rotate(270, expand=True) if class_id == 2 else pl_page.to_image(resolution=95)
                                })
                        
                elif category == 'Word':
                    word_count+=1
                    word_pages.append(pg_no)
                    excel_file = os.path.join(temp_dir, f'{os.path.splitext(pdf_file.filename)[0]}_page-{pg_no}.xlsx')
                    pl_page = pdf.pages[pg_no-1]

                    extracted_tables = pl_page.extract_tables()
                    with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
                        start_row = 0
                        tbl_count = 0
                        for tbl_no, table in enumerate(extracted_tables):
                            table_count+=1
                            tbl_count += 1
                            table_df = pd.DataFrame(table[1:], columns=table[0])
        
                            if isinstance(table_df.columns, pd.MultiIndex):
                                table_df.columns = [' '.join(col).strip() for col in table_df.columns.values]
        
                            table_df.to_excel(writer, index=False, header=True, startrow=start_row, sheet_name='Page Tables')
                                    
                            start_row += len(table_df) + 3
                                    
                            if not table_df.empty:
                                excel_files_info.append({
                                    'excel_file': excel_file,
                                    'page_num': pg_no,
                                    'table_num': tbl_count,
                                    "image": pl_page.to_image(resolution=95)
                                })
                        
                else:
                    edge_case_count+=1
                    edge_case_pages.append(pg_no)
                    print(f"Skipping page {pg_no} with invalid category '{category}'.")
                
        if excel_files_info:
            combined_excel_path = os.path.join(temp_dir, f'{pdf_file.filename[:-4]}_combined_0611_part4.xlsx')
            img_added_pg_no = []
            with pd.ExcelWriter(combined_excel_path, engine='openpyxl') as writer:
                for file_info in excel_files_info:
                    #df = pd.read_excel(file_info['excel_file'])
                    with pd.ExcelFile(file_info['excel_file']) as xls:#changed
                        df = pd.read_excel(xls)
                    sheet_name = f'Page_{file_info["page_num"]}'
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
        
                    if file_info['page_num'] not in img_added_pg_no:
                        img_added_pg_no.append(file_info['page_num'])
                        workbook = writer.book
                        worksheet = workbook[sheet_name]
        
                        img_buffer = io.BytesIO()
                        file_info['image'].save(img_buffer, format="PNG")
                        img_buffer.seek(0)
                        img_for_excel = ExcelImage(img_buffer)
        
            
                        worksheet.add_image(img_for_excel, "R1")
                        
        else:
            # return with 400 status code with message saying no tables found
            shutil.rmtree(temp_dir)
            raise HTTPException(status_code=400, detail="no tables")

        new_row = [
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            pdf_file.filename,
            ', '.join(map(str, selected_pgs)),
            len(selected_pgs),
            table_count,
            a3_count,
            'NA' if not a3_pages else ', '.join(map(str, a3_pages)),
            word_count,
            'NA' if not word_pages else ', '.join(map(str, word_pages)),
            scanned_count,
            'NA' if not scanned_pages else ', '.join(map(str, scanned_pages)),
            edge_case_count,
            'NA' if not edge_case_pages else ', '.join(map(str, edge_case_pages)),
            str(time.time() - start_time_whole_process),
            tok_in,
            tok_out,
            calculate_cost(tok_in, tok_out),
            ', '.join(map(str, dpi_list))
        ]
        sheet.append_row(new_row, value_input_option='USER_ENTERED')
        # def cleanup():
        #     shutil.rmtree(temp_dir)

        return FileResponse(
            path=combined_excel_path,
            filename=f'{pdf_file.filename[:-4]}_combined.xlsx',
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            # background=BackgroundTask(cleanup)
        )

    except Exception as e:
        raise e

@app.post("/v2/extract")
async def extract(
    pdf_file: UploadFile = File(...),
    data: str = Form(...),
):
    temp_dir = tempfile.mkdtemp()
    print("data: ", data)
    
    selected_pgs = []
    a3_pages = []
    scanned_pages = []
    dpi_list = []
    a3_count = 0
    scanned_count = 0

    pdf_path = os.path.join(temp_dir, pdf_file.filename)
    contents = await pdf_file.read()
    with open(pdf_path, 'wb') as f:
        f.write(contents)
    
    data = json.loads(data)
    print(data)

    batch_request = []
    img_list = []
    word_data = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in data:
            pg_no = page['page_num']
            category = page['category']
            dpi = page['dpi']

            dpi_list.append(dpi)
            selected_pgs.append(pg_no)
            page_index = pg_no - 1  # Adjust for zero-based indexing
            if page_index < 0 or page_index >= len(pdf.pages):
                raise HTTPException(status_code=400, detail=f"Page number {pg_no} out of range for the provided PDF")
            pl_page = pdf.pages[page_index]
            pg_image = pl_page.to_image(resolution=dpi).original

            if category in ['A3', 'Scanned']:
                if category == 'A3':
                    a3_count += 1
                    a3_pages.append(pg_no)
                else:
                    scanned_count += 1
                    scanned_pages.append(pg_no)

                excel_file = os.path.join(temp_dir, f'{os.path.splitext(pdf_file.filename)[0]}_page-{pg_no}.xlsx')
                writer = pd.ExcelWriter(excel_file, engine='openpyxl') 
                start_row = 0
                tbl_count = 0
                for tables in page['bbox']:
                    class_id = tables['class_id']
                    bbox = tables['xyxy']
                    print(">>>>bbox: ", bbox)
                    cropped_img = pg_image.crop(bbox)
                    if class_id == 2:
                        cropped_img = cropped_img.rotate(270, expand=True)
                    img_buffer = io.BytesIO()
                    cropped_img.save(f"{tbl_count}-test.png")
                    cropped_img.save(img_buffer, format="PNG")
                    img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')

                    batch_request.append({
                        "message": [
                            {
                                'role': 'user',
                                'content': [
                                    {
                                        "type": "text",
                                        "text": "Extract table accurately from this image."
                                    },
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": "image/png",
                                            "data": img_base64,
                                        },
                                    }
                                ]
                            }
                        ],
                        "file_name": pdf_file.filename,
                        "pg_no": pg_no
                    })

                    attach_image = pl_page.to_image(resolution=95).original.rotate(270, expand=True) if class_id == 2 else pl_page.to_image(resolution=95)
                    # convert to base64
                    img_buffer = io.BytesIO()
                    attach_image.save(img_buffer, format="PNG")
                    img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                    img_list.append(
                        {
                            "page_num": pg_no,
                            "excel_attach_image": img_base64
                        }
                    )

    print(len(batch_request))
    req_ids, response = batch_agent.create_job(batch_request)

    claude_job_id = response.id
    status = response.processing_status

    job_collection.insert_one(
        {
            "job_id": claude_job_id,
            "pdf_file": pdf_file.filename,
            "selected_pgs": selected_pgs,
            "a3_pages": a3_pages,
            "scanned_pages": scanned_pages,
            "dpi_list": dpi_list,
            "a3_count": a3_count,
            "req_ids": req_ids,
            "img_list": img_list,
            "word_data": word_data
        }
    )

    return {
        "claude_job_id": claude_job_id,
        "status": status,
        "time_est": len(req_ids) * 26
        }

@app.get("/v2/extract/{job_id}")
async def get_extract(job_id: str):
    job = job_collection.find_one({"job_id": job_id})
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    temp_dir = tempfile.mkdtemp()
    responses, status, msg = batch_agent.get_results(job_id)

    if responses:
        excel_files_info = []
        
        for page in job['selected_pgs']:
            excel_file = os.path.join(temp_dir, f'{os.path.splitext(job["pdf_file"])[0]}_page-{page}.xlsx')
            with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
                start_row = 0
                tbl_count = 0
                
                tables = []
                for response in responses:
                    if int(response['custom_id'].split('-')[-1]) == page:
                        tables.append(response)
                
                for table in tables:
                    for gen_table in table['html_code']:
                        gen_table = "<table" + gen_table
                        tbl_count += 1

                        html_file = os.path.join(temp_dir, f'file-{job["pdf_file"][:-4]}-page-{page}-table-{tbl_count}.html')
                        with open(html_file, 'w', encoding='utf-8') as file:
                            file.write(gen_table)

                        excel_file_per_table = os.path.join(temp_dir, f'file-{job["pdf_file"][:-4]}-page-{page}-table-{tbl_count}.xlsx')
                        convert_htm_to_excel(html_file, excel_file_per_table)

                        with pd.ExcelFile(excel_file_per_table) as xls:
                            table_df = pd.read_excel(xls)

                        if isinstance(table_df.columns, pd.MultiIndex):
                            table_df.columns = [' '.join(col).strip() for col in table_df.columns.values]

                        table_df.to_excel(writer, index=False, header=True, startrow=start_row, sheet_name='Page Tables')
                                
                        start_row += len(table_df) + 3

                        for i in job['img_list']:
                            if i['page_num'] == page:
                                to_attach = i['excel_attach_image']
                            else:
                                to_attach = None

                        def convert_base64_to_image(base64_string):
                            img_buffer = io.BytesIO(base64.b64decode(base64_string))
                            img = Image.open(img_buffer)
                            return img
                        
                        excel_files_info.append({
                            'excel_file': excel_file,
                            'page_num': page,
                            'table_num': tbl_count,
                            'image': convert_base64_to_image(to_attach)
                        })

        if excel_files_info:
            combined_excel_path = os.path.join(temp_dir, f'{job["pdf_file"][:-4]}_combined_0611_part4.xlsx')
            img_added_pg_no = []
            with pd.ExcelWriter(combined_excel_path, engine='openpyxl') as writer:
                for file_info in excel_files_info:
                    with pd.ExcelFile(file_info['excel_file']) as xls:
                        df = pd.read_excel(xls)
                    sheet_name = f'Page_{file_info["page_num"]}'
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
        
                    if file_info['page_num'] not in img_added_pg_no:
                        img_added_pg_no.append(file_info['page_num'])
                        workbook = writer.book
                        worksheet = workbook[sheet_name]
        
                        img_buffer = io.BytesIO()
                        file_info['image'].save(img_buffer, format="PNG")
                        img_buffer.seek(0)
                        img_for_excel = ExcelImage(img_buffer)
            
                        worksheet.add_image(img_for_excel, "R1")

            with open(combined_excel_path, 'rb') as file:
                file_data = file.read()
                encoded_file = base64.b64encode(file_data).decode('utf-8')

            response_content = {
                "success": True,
                "status": status,
                'message': f'{len(responses)} tables completed.',
                'filename': f'{job["pdf_file"][:-4]}.xlsx',
                'file_data': encoded_file
            }
            return response_content

            # return FileResponse(
            #     path=combined_excel_path,
            #     filename=f'{job["pdf_file"][:-4]}_combined.xlsx',
            #     media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            #     # background=BackgroundTask(cleanup)
            # )
        
    else:
        shutil.rmtree(temp_dir)
        return {
            "success": True,
            "status": status,
            "progress": (msg['succeeded'] / len(job['req_ids'])) * 100,
        }
