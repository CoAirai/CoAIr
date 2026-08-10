import { useState } from "react";
import Icon from "@/components/Icon";

type FieldProps = {
    className?: string;
    classInput?: string;
    label?: string;
    textarea?: boolean;
    type?: string;
    required?: boolean;
    isSmall?: boolean;
};

const Field = ({
    className,
    classInput,
    label,
    textarea,
    type,
    required,
    isSmall,
    ...inputProps
}: FieldProps &
    React.InputHTMLAttributes<HTMLInputElement> &
    React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
    const [showPassword, setShowPassword] = useState(false);

    const error = false;

    return (
        <div className={`${className || ""}`}>
            {label && (
                <div className="mb-1 text-label-md">
                    {label}
                    {required && <span className="text-[#E93544]">*</span>}
                </div>
            )}
            <div className={`relative ${textarea ? "flex" : ""}`}>
                {textarea ? (
                    <textarea
                        className={`w-full border border-stroke-soft-200 text-strong-950 transition-colors resize-none outline-0 focus:!border-blue-500 ${
                            error ? "!border-[#E93544]" : ""
                        } ${
                            isSmall
                                ? "h-30 p-2 rounded-lg text-label-sm"
                                : "h-37.5 p-4 rounded-xl text-label-md"
                        } ${classInput || ""}`}
                        {...inputProps}
                    ></textarea>
                ) : (
                    <input
                        className={`w-full border border-stroke-soft-200 text-strong-950 transition-colors outline-0 focus:!border-blue-500 ${
                            error ? "!border-[#E93544]" : ""
                        } ${
                            isSmall
                                ? "h-9 px-2.5 rounded-lg text-label-sm"
                                : "h-12 px-4 rounded-xl text-label-md"
                        } ${classInput || ""}`}
                        type={
                            type === "password"
                                ? showPassword
                                    ? "text"
                                    : "password"
                                : type || "text"
                        }
                        {...inputProps}
                    />
                )}
                {type === "password" && (
                    <button
                        className={`group text-0 absolute right-3 top-1/2 -translate-y-1/2 outline-0 before:absolute before:top-1/2 before:left-1/2 before:w-5.5 before:h-0.75 before:border-t before:border-weak-50 before:-translate-1/2 before:-rotate-45 before:transition-all before:bg-soft-400 hover:before:bg-strong-950 ${
                            showPassword
                                ? "before:opacity-0"
                                : "before:opacity-100"
                        }`}
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        <Icon
                            className="fill-soft-400 transition-colors group-hover:fill-strong-950"
                            name="eye"
                        />
                    </button>
                )}
            </div>
        </div>
    );
};

export default Field;
