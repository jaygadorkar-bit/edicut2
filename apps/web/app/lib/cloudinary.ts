/**
 * Optimizes a Cloudinary image URL by injecting 'f_auto' and 'q_auto' if they are not already present.
 */
export function optimizeCloudinaryUrl(url: string | null | undefined): string {
  if (!url) return "";
  
  // Only optimize cloudinary urls
  if (!url.includes("res.cloudinary.com")) {
    return url;
  }

  // If already optimized, return as is
  if (url.includes("f_auto") && url.includes("q_auto")) {
    return url;
  }

  const parts = url.split("/image/upload/");
  if (parts.length !== 2) {
    // Provide a fallback for other cloudinary URL formats if not using /image/upload/
    return url;
  }

  const [base, rest] = parts;
  
  // Check if there are already transformations
  const transformations = [];
  let pathWithoutTransformations = rest;

  // Sometimes there are existing transformations like w_500,c_fill
  if (rest.includes("/")) {
    const firstSegment = rest.split("/")[0];
    // Check if the first segment looks like transformations (e.g. w_..., h_..., c_...)
    if (/^[a-z]+_[a-zA-Z0-9.,]+/.test(firstSegment)) {
      transformations.push(firstSegment);
      pathWithoutTransformations = rest.substring(firstSegment.length + 1);
    }
  }

  const newTransformations = [];
  if (!url.includes("f_auto")) newTransformations.push("f_auto");
  if (!url.includes("q_auto")) newTransformations.push("q_auto");

  let fullTransformations = newTransformations.join(",");
  if (transformations.length > 0) {
    fullTransformations = `${transformations[0]},${fullTransformations}`;
  }

  return `${base}/image/upload/${fullTransformations}/${pathWithoutTransformations}`;
}
