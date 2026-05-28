export async function onRequest(context: any) {
  // Extract path and query string from the original URL
  const originalUrl = new URL(context.request.url);
  const path = originalUrl.pathname;
  const search = originalUrl.search;
  
  // The secure Cloud Run backend URL
  const backendBase = "https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app";
  const targetUrl = `${backendBase}${path}${search}`;

  // Handle CORS preflight explicitly here on the Edge
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": context.request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization, X-Requested-With, Accept, Origin",
        "Access-Control-Max-Age": "86400",
      }
    });
  }

  // Rewrite headers
  const headers = new Headers(context.request.headers);
  headers.set("Host", new URL(backendBase).hostname);

  // Initialize request options
  const requestOptions: RequestInit = {
    method: context.request.method,
    headers: headers,
    redirect: "manual" as RequestRedirect,
  };

  // Add body for POST/PUT requests
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    requestOptions.body = context.request.body;
  }

  try {
    // Forward the request to the Cloud Run backend
    let response = await fetch(targetUrl, requestOptions);

    // We must clone the response to modify its headers before sending it back
    let newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    // Add permissive CORS headers to the response going back to the browser
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    
    return newResponse;
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Cloudflare Pages Function Proxy Error: " + error.message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
