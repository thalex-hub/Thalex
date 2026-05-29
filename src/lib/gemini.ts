import { getApiUrl } from './utils';

export async function generateGeminiContent(prompt: string, history?: any[]) {
  const response = await fetch(getApiUrl('/api/gemini'), {
    method: 'POST',
    // Always use text/plain instead of application/json to bypass strict CORS OPTIONS preflight blocking on custom domains
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ prompt, history }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate content');
  }
  
  const data = await response.json();
  return data.response;
}
