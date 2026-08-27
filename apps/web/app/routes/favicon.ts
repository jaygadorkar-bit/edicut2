const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#c0121f"/>
  <text x="32" y="42" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900" letter-spacing="-1" text-anchor="middle">EC</text>
</svg>`;

export function loader() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  });
}
