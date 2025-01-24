import React from "react";
import { Navigate } from "react-router";

const PrivateRoute = ({ children }) => {
    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";

    return isLoggedIn ? <>{children}</> : <Navigate to="/login" />;
};

export default PrivateRoute;
