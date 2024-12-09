import React from 'react';
import { Typography, LinearProgress, Button, IconButton } from '@mui/material';
import { FileDownload, Delete, Cancel } from '@mui/icons-material';

const JobCard = ({ job, deleteJob, cancelJob }) => {
    console.log(job)
    return (
        <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
            <Typography variant="overline">{job.fileName}</Typography>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption">Status: {job.message}</Typography>
                <Typography variant='caption'>{job.progress}%</Typography>
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
            }}>
                <LinearProgress
                    variant="determinate"
                    color="success"
                    value={job.progress}
                    style={{ width: '100%', marginRight: `${job.status === 'pending' ? '10px' : '0px'}` }}
                />
                {job.status === 'pending' && (
                    <IconButton
                        color="error"
                        onClick={() => cancelJob(job.jobId)}
                        title="Cancel Job"
                    >
                        <Cancel />
                    </IconButton>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {job.status === 'completed' && (
                    <a
                        href={job.fileUrlToDownload}
                        download={`${job.fileName.replace('.pdf', '')}_extracted_data.xlsx`}
                    >
                        <Button
                            variant="contained"
                            color="success"
                            sx={{ mt: '10px' }}
                            startIcon={<FileDownload />}
                            size="small"
                        >
                            Download
                        </Button>
                    </a>
                )}
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<Delete />}
                    onClick={() => deleteJob(job.jobId)}
                    size="small"
                    sx={{ mt: '10px' }}
                >
                    Delete
                </Button>
            </div>
        </div>
    );
};

// export default JobCard;
export default React.memo(JobCard);
