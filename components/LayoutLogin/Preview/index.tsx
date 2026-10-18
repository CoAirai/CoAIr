"use client";

import { useEffect, useRef } from "react";
import { mountCoairPreview } from "./coair-preview.js";
import { COAIR_PREVIEW_CONTENT } from "./content.js";
import "./coair-preview.css";

const Preview = ({ className = "" }: { className?: string }) => {
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!ref.current) return;
        const controller = mountCoairPreview(ref.current, COAIR_PREVIEW_CONTENT);
        return () => controller.destroy();
    }, []);
    return <section ref={ref} className={className} />;
};

export default Preview;
