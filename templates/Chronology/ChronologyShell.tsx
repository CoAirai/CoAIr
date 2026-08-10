"use client";

import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";

type Props = {
    children: React.ReactNode;
};

const ChronologyShell = ({ children }: Props) => {
    const router = useRouter();

    return (
        <Layout
            onClickNew={() => {
                router.push("/workspace/chronology");
            }}
        >
            {children}
        </Layout>
    );
};

export default ChronologyShell;
