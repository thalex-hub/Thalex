export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  const originalUrl = new URL(request.url);
  
  // Extract the original path parameter passed from vercel.json rewrite
  const pathQuery = originalUrl.searchParams.get("path") || "";
  
  // Clean up search parameters to remove the proxy path key so we don't pollute backend requests
  const searchParams = new URLSearchParams(originalUrl.search);
  searchParams.delete("path");
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  
  // The secure Cloud Run backend URL
  const backendBase = "https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app";
  
  // Construct the target pathname, ensuring we sanitize duplicate slashes and fallback gracefully
  let finalPath = pathQuery ? `/${pathQuery}` : originalUrl.pathname;
  finalPath = finalPath.replace(/\/+/g, "/");
  
  const targetUrl = `${backendBase}${finalPath}${search}`;

  // Standard preflight request response
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization, X-Requested-With, Accept, Origin",
        "Access-Control-Max-Age": "86400",
      }
    });
  }

  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("host");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-for");
  headers.delete("origin");
  headers.delete("referer");

  const requestOptions: any = {
    method: request.method,
    headers: headers,
    redirect: "manual",
  };

  // Safely grab the request body as ArrayBuffer to bypass duplex stream fetch requirements
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const arrayBuffer = await request.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        requestOptions.body = arrayBuffer;
      }
    } catch (e) {
      // Body reading might fail if none is provided, safe to ignore
    }
  }

  try {
    const response = await fetch(targetUrl, requestOptions);

    // Build the response to send back to client
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
    
    return newResponse;
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Vercel Proxy Error: " + error.message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}
