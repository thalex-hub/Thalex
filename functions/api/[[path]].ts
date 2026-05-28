export async function onRequest(context: { request: Request; env: any; params: any }) {
  const url = new URL(context.request.url);
  
  // Absolute API backend URL on Cloud Run
  const backendUrl = "https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app" + url.pathname + url.search;

  const headers = new Headers(context.request.headers);
  // Override Host header to point to the backend server
  headers.set('Host', 'ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app');

  // Set up request options for the proxy fetch
  const requestOptions: RequestInit = {
    method: context.request.method,
    headers,
  };

  // Skip body for GET/HEAD/OPTIONS methods
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD' && context.request.method !== 'OPTIONS') {
    try {
      requestOptions.body = await context.request.clone().arrayBuffer();
    } catch (e) {
      // Fallback if body cloning is not possible
    }
  }

  try {
    const res = await fetch(backendUrl, requestOptions);
    
    // Create copy of the response to append standard CORS headers
    const newHeaders = new Headers(res.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ 
      success: false,
      error: `Proxy Error: ${error.message || String(error)}` 
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
