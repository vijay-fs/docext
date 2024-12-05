// jobsReducer.js
export const initialJobsState = {
  jobs: [], // List of job objects
};

export const jobsReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_JOB':
      return {
        ...state,
        jobs: [...state.jobs, action.payload],
      };
    case 'UPDATE_JOB':
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.jobId === action.payload.jobId ? { ...job, ...action.payload } : job
        ),
      };
    case 'DELETE_JOB':
      return {
        ...state,
        jobs: state.jobs.filter((job) => job.jobId !== action.payload.jobId),
      };
    default:
      return state;
  }
};
