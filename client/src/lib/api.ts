import axios from 'axios'

// Same-origin requests through the Vite proxy, so the session cookie is sent
// automatically. Non-2xx responses reject with an AxiosError.
export const api = axios.create({ baseURL: '/api' })
