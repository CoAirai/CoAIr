import { useState } from "react";
import { useTheme } from "next-themes";
import Editor from "@monaco-editor/react";
import Icon from "@/components/Icon";
import Button from "@/components/Button";

interface CodeEditorProps {
    title?: string;
    language?: string;
    initialCode?: string;
    onCodeChange?: (code: string) => void;
    onGenerate?: () => void;
    isGenerating?: boolean;
}

const CodeEditor = ({
    title = "Code Editor",
    language = "python",
    initialCode = "",
    onCodeChange,
    onGenerate,
    isGenerating = false,
}: CodeEditorProps) => {
    const [code, setCode] = useState(initialCode);
    const { theme } = useTheme();

    const handleEditorChange = (value: string | undefined) => {
        const newCode = value || "";
        setCode(newCode);
        onCodeChange?.(newCode);
    };

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(code);
            console.log("Code copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy code: ", err);
        }
    };

    return (
        <div className="bg-white-0 rounded-xl border border-stroke-soft-200 overflow-hidden">
            <div className="flex items-center gap-2 p-4 font-[1rem] leading-[1.25rem]">
                <Icon className="fill-strong-950" name="ai-programming" />
                {title}
                <Button
                    className="!h-9 ml-auto !px-3 rounded-lg text-sub-600 max-md:hidden"
                    isStroke
                    onClick={handleCopyCode}
                >
                    Copy Code
                    <svg
                        className="size-3.25 fill-icon-soft-400"
                        xmlns="http://www.w3.org/2000/svg"
                        width="13"
                        height="13"
                        viewBox="0 0 13 13"
                    >
                        <path
                            opacity=".4"
                            d="M9.108 4.32l1.94.068c.523.07.964.221 1.314.571s.501.791.571 1.314C13 6.776 13 7.417 13 8.212h0v.645h0l-.068 1.94c-.07.523-.221.964-.571 1.314s-.791.501-1.314.571c-.504.068-1.145.068-1.94.068h0-.645 0c-.795 0-1.436 0-1.94-.068-.523-.07-.964-.221-1.314-.571s-.5-.791-.571-1.314c-.068-.504-.068-1.145-.068-1.94h0v-.645h0l.068-1.94c.07-.523.221-.964.571-1.314s.791-.5 1.314-.571c.504-.068 1.145-.068 1.94-.068h0 .645 0z"
                        />
                        <path d="M3.698 8.161l.076-2.005c.083-.62.279-1.275.818-1.814s1.195-.735 1.814-.818c.562-.076 1.253-.076 2.005-.076h1.3c.172 0 .258 0 .31-.056s.046-.14.033-.307l-.042-.413c-.075-.558-.226-1.021-.546-1.412a2.76 2.76 0 0 0-.383-.383C8.671.539 8.178.39 7.578.319 6.995.25 6.257.25 5.325.25h-.057c-.932 0-1.67 0-2.253.069-.599.071-1.093.22-1.505.558a2.76 2.76 0 0 0-.383.383c-.338.412-.487.906-.558 1.505C.5 3.349.5 4.087.5 5.018v.057l.069 2.253c.071.599.22 1.093.558 1.505a2.76 2.76 0 0 0 .383.383c.391.321.854.471 1.412.546l.413.042c.168.012.251.019.307-.033s.056-.138.056-.31v-1.3z" />
                    </svg>
                </Button>
            </div>
            <div className="h-64">
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    onChange={handleEditorChange}
                    theme={theme === "light" ? "vs-light" : "vs-dark"}
                    options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        lineNumbers: "on",
                        roundedSelection: false,
                        scrollbar: {
                            vertical: "auto",
                            horizontal: "auto",
                        },
                        automaticLayout: true,
                        padding: { top: 4, bottom: 0 },
                        fontFamily:
                            "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                    }}
                />
            </div>
            {onGenerate && (
                <div className="py-4 text-center">
                    <Button
                        isStroke
                        onClick={onGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? "Generating Code..." : "Generate Code"}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default CodeEditor;
