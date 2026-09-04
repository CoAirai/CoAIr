import { notFound } from "next/navigation";
import BonesCaptureClient from "./BonesCaptureClient";

export default function BonesCapturePage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BonesCaptureClient />;
}
