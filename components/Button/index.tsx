import React from "react";
import Link, { LinkProps } from "next/link";
import Icon from "@/components/Icon";

type CommonProps = {
    className?: string;
    icon?: string;
    children?: React.ReactNode;
    isBlack?: boolean;
    isWhite?: boolean;
    isRed?: boolean;
    isBlue?: boolean;
    isStroke?: boolean;
    isCircle?: boolean;
};

type ButtonAsButton = {
    as?: "button";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

type ButtonAsAnchor = {
    as: "a";
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

type ButtonAsLink = {
    as: "link";
} & LinkProps;

type ButtonProps = CommonProps &
    (ButtonAsButton | ButtonAsAnchor | ButtonAsLink);

const Button: React.FC<ButtonProps> = ({
    className,
    icon,
    children,
    isBlack,
    isWhite,
    isRed,
    isBlue,
    isStroke,
    isCircle,
    as = "button",
    ...props
}) => {
    const isLink = as === "link";
    const Component: React.ElementType = isLink ? Link : as;

    return (
        <Component
            className={`inline-flex items-center justify-center gap-2 h-11 px-4 border rounded-full text-label-sm transition-all cursor-pointer disabled:pointer-events-none ${
                isBlack
                    ? "bg-strong-950 border-transparent text-white-0 fill-white-0 hover:bg-strong-950/90"
                    : ""
            } ${
                isWhite
                    ? "bg-white-0 border-transparent text-strong-950 fill-strong-950 hover:bg-soft-200"
                    : ""
            } ${
                isStroke
                    ? "border-soft-200 bg-white-0 text-sub-600 fill-sub-600 hover:border-stroke-sub-300 hover:text-strong-950 hover:fill-strong-950"
                    : ""
            } ${
                isRed
                    ? "bg-[#FB3748] border-transparent text-static-white fill-static-white hover:bg-[#FB3748]/90"
                    : ""
            } ${
                isBlue
                    ? "bg-gradient-to-r from-blue-500 to-blue-300 border-stroke-soft-200 text-static-white fill-static-white hover:opacity-90"
                    : ""
            } ${
                isCircle ? "!gap-0 !w-11 !px-0 max-md:!w-10 max-md:!h-10" : ""
            } ${className || ""}`}
            {...(isLink ? (props as LinkProps) : props)}
        >
            {icon && (
                <Icon
                    className={`fill-inherit ${
                        isCircle ? "!size-6 max-md:!size-5" : ""
                    }`}
                    name={icon}
                />
            )}
            {children}
        </Component>
    );
};

export default Button;
