import { ensureAuthorizedResponse, getAccessToken, getWorkInfo } from '../auth';
import { BASE_URL } from './endpoints';

async function buildHeaders(extra = {}) {
  const [accessToken, workInfo] = await Promise.all([getAccessToken(), getWorkInfo()]);
  const unitId = workInfo?.companyId;

  if (!accessToken || !unitId) {
    throw new Error('Missing access token or unitId. Please log in again.');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    unitId: String(unitId),
    Accept: 'application/json',
    ...extra,
  };
}

async function parseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// GET request to our API. `params` is a plain object → URLSearchParams.
export async function apiGet(path, { params, label } = {}) {
  const headers = await buildHeaders();
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  const response = await fetch(`${BASE_URL}${path}${qs}`, { method: 'GET', headers });
  await ensureAuthorizedResponse(response, label ?? `GET ${path}`);
  return parseBody(response);
}

// POST request with JSON body. Returns parsed response (may be null for 204).
export async function apiPost(path, body, { label } = {}) {
  const headers = await buildHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  await ensureAuthorizedResponse(response, label ?? `POST ${path}`);
  return parseBody(response);
}

// PUT request with JSON body.
export async function apiPut(path, body, { label } = {}) {
  const headers = await buildHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  await ensureAuthorizedResponse(response, label ?? `PUT ${path}`);
  return parseBody(response);
}
