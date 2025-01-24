import { LoadingButton } from "@mui/lab";
import { Typography } from "@mui/material";
import React, { useState } from "react";
import { useNavigate } from "react-router";



const LoginPage = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null as null | string); // State for error message
    let navigate = useNavigate();

    const handleLogin = (event: React.FormEvent) => {
        event.preventDefault();
        // Simulated login validation
        if (email === "coffee@coffeeinc.in" && password === "password") {
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("email", email);
            localStorage.setItem("password", password);
            setError(null); // Clear error if successful
            navigate("/");
        } else {
            setError("Invalid email or password. Please try again."); // Show error message
        }
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
    };

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#f9fafb" }}>
            <div
                style={{
                    width: "100%",
                    maxWidth: "400px",
                    padding: "20px",
                    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                }}
            >
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: "600" }}>Login</h2>
                    <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Enter your email and password to log in.</p>
                </div>
                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: "16px" }}>
                        <label htmlFor="email" style={{ display: "block", marginBottom: "8px", fontSize: "0.875rem", fontWeight: "500" }}>
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={handleEmailChange}
                            required
                            style={{
                                width: "100%",
                                padding: "10px",
                                fontSize: "1rem",
                                borderRadius: "4px",
                                border: "1px solid #d1d5db",
                            }}
                        />
                    </div>
                    <div style={{ marginBottom: "16px" }}>
                        <label htmlFor="password" style={{ display: "block", marginBottom: "8px", fontSize: "0.875rem", fontWeight: "500" }}>
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={handlePasswordChange}
                            required
                            style={{
                                width: "100%",
                                padding: "10px",
                                fontSize: "1rem",
                                borderRadius: "4px",
                                border: "1px solid #d1d5db",
                            }}
                        />
                    </div>
                    {error && (
                        <div style={{ color: "#ef4444", fontSize: "0.875rem", marginBottom: "16px" }}>
                            {error}
                        </div>
                    )}
                    <LoadingButton
                        type="submit"
                        variant="contained"
                        startIcon={""}
                        size="large"
                        color='primary'
                        sx={{ mt: "30px", width: "100%" }}
                    >
                        <Typography variant="button">Login</Typography>
                    </LoadingButton>
                </form>
                <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginTop: "16px" }}>
                    Don&apos;t have an account? {" "}
                    <a href="#" style={{ color: "#3b82f6", textDecoration: "underline" }}>
                        Sign up
                    </a>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
