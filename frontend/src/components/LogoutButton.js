import { Typography } from '@mui/material';
import { useNavigate } from 'react-router';

const LogoutButton = () => {
    const navigate = useNavigate(); // Use the navigate hook here
    const handleLogout = () => {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("email");
        localStorage.removeItem("password");
        navigate("/login");
    };

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                padding: "10px 32px 0px 0",
                borderBottom: "1px solid #eeeeee",

            }} className='bg-gray-100'>
            <Typography sx={{
                cursor: "pointer",
            }} variant="overline" onClick={handleLogout}>Logout</Typography>
        </div>
    )
}

export default LogoutButton