import { memo, useId, type RefObject } from "react";

/** Original vector outlines from public/icons/edicut-logo.svg, separated for motion.
 * The Cut letters remain transparent cutouts, through the animated luminance mask. */
export const AnimatedLogo = memo(function AnimatedLogo({
  svgRef,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      ref={svgRef}
      className="logo-preview__art"
      viewBox="245 70 1290 660"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>EdiCut animated logo</title>
      <defs>
        <mask
          id={`${id}-cut`}
          maskUnits="userSpaceOnUse"
          x="800"
          y="350"
          width="700"
          height="350"
          style={{ maskType: "luminance" }}
        >
          <rect x="800" y="350" width="700" height="350" fill="white" />
          <path
            data-logo-part="C"
            fill="black"
            d="M1095 488l-69 6c-8-23-25-37-46-37-32 0-55 27-55 63s23 63 55 63c21 0 39-14 47-37l68 7c-14 52-57 88-115 88-70 0-121-50-121-121s51-120 121-120c58 0 101 36 115 88Z"
          />
          <path
            data-logo-part="u"
            fill="black"
            d="M1106 463h62v100c0 17 9 26 26 26s27-12 27-27v-99h62v175h-60l-2-19c-13 15-29 22-49 22-42 0-66-24-66-61V463Z"
          />
          <path
            data-logo-part="t"
            fill="black"
            d="M1314 415h62v48h42v52h-42v53c0 14 7 21 21 21l21-1v51c-14 2-28 2-45 2-39 0-59-18-59-53v-73h-20v-52h20v-48Z"
          />
        </mask>
      </defs>
      <g data-logo-part="logo">
        <g fill="#000000">
          <path
            data-logo-part="E"
            d="M330 388h186v58H399v42h95v59h-95v42h117v58H330V388Z"
          />
          <path
            data-logo-part="d"
            fillRule="evenodd"
            d="M661 383h67v264h-66v-23c-14 16-31 24-55 24-52 0-90-40-90-96s38-94 89-94c23 0 41 8 55 23v-98Zm-37 126c-23 0-39 18-39 43s16 44 39 44 39-19 39-44-16-43-39-43Z"
          />
          <path
            data-logo-part="dot"
            d="M818 404a35 34 0 1 1-70 0 35 34 0 1 1 70 0Z"
          />
          <path data-logo-part="i" d="M748 456h72v192h-72V456Z" />
        </g>
        <g fill="#C90F20">
          <g data-logo-part="body">
            <path
              mask={`url(#${id}-cut)`}
              d="M840 378h579c18 0 33 15 33 33v221c0 18-15 32-33 32H872c-18 0-32-14-32-32V378Z"
            />
          </g>
          <g data-logo-part="clapper">
            <path d="M840 378V333c0-19 11-31 30-35l52-8 76 73-158 15Z" />
            <path d="m978 279 95-17 79 77-100 15-74-75Z" />
            <path d="m1129 252 87-16 79 78-90 14-76-76Z" />
            <path d="m1269 225 126-25c19-4 31 3 34 21l8 40c4 17-3 28-20 31l-69 11-79-78Z" />
          </g>
        </g>
      </g>
    </svg>
  );
});
