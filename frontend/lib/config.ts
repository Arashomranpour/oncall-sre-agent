// Local dev talks to the API on :8000. In production CloudFront routes /api/* to API Gateway.
export const getApiUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.hostname === "localhost" ? "http://localhost:8000" : "";
  }
  return "";
};

export const API_URL = getApiUrl();
