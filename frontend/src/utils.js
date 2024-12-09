export function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

const URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

export const ENDPOINTS = {
  CATEGORIZE: `${URL}/categorize`,
  SET_DPI: `${URL}/set_dpi`,
  SAVE_M_OBB: `${URL}/save_m_obb`,
  EXTRACT: `${URL}/v3/extract`,
  EXTRACTJOBID: `${URL}/v3/extract/`,
  CANCELJOBID: `${URL}/v3/cancel/`,
};