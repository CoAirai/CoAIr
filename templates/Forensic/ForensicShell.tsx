"use client";

import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";

type Props = {
    children: React.ReactNode;
};

const ForensicShell = ({ children }: Props) => {
    const router = useRouter();

    return (
        <Layout
            onClickNew={() => {
                router.push("/workspace/forensic");
            }}
        >
            {children}
        </Layout>
    );
};

export default ForensicShell;
