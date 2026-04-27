"use client";

import React, { forwardRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";

interface ReCAPTCHAProps {
  onChange: (token: string | null) => void;
}

export const GoogleReCAPTCHA = forwardRef<ReCAPTCHA, ReCAPTCHAProps>(
  ({ onChange }, ref) => {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

    if (!siteKey) {
      return null; // Don't show anything if key is missing
    }

    return (
      <div className="relative">
        <ReCAPTCHA
          ref={ref}
          size="invisible"
          sitekey={siteKey}
          onChange={onChange}
          theme="dark"
        />
      </div>
    );
  }
);

GoogleReCAPTCHA.displayName = "GoogleReCAPTCHA";
