// Dashboard.js
import React from 'react';
import { LinearProgress, Button, Typography } from '@mui/material';
import { FileDownload, Delete, DocumentScanner } from '@mui/icons-material';
import { useJobs } from '../hooks/useJobs';
import LoadingButton from '@mui/lab/LoadingButton';
import { Link } from 'react-router';
import JobCard from './JobCard';

const Dashboard = () => {
    const { jobs, deleteJob } = useJobs();
    console.log(jobs)
    return (
        <div className='dashboard'>
            <Typography variant="h3" color='primary' sx={{ my: "30px", fontWeight: "bold", textAlign: "center" }}>Doc Extractor</Typography>
            {jobs.length > 0 ? jobs?.map((job) => (
                <JobCard key={job.jobId} job={job} deleteJob={deleteJob} />
            )) :
                <div style={{
                    display: "flex",
                    justifyContent: "center"
                }}>
                    <Typography sx={{
                    }} variant="overline">No extracted data found</Typography>
                </div>
            }
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
            }}>
                <Link to="/extract" >
                    <LoadingButton
                        variant="contained"
                        startIcon={<DocumentScanner />}
                        size="large"
                        sx={{ mt: "30px" }}
                    >
                        <Typography variant="button">Extract Data</Typography>
                    </LoadingButton>
                </Link>
            </div>


        </div>
    );
};

// export default Dashboard;
export default React.memo(Dashboard);