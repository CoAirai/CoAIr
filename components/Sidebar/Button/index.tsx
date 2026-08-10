import Icon from "@/components/Icon";

type Props = {
    title: string;
    icon: string;
    onClick: () => void;
};

const Button = ({ title, icon, onClick }: Props) => {
    return (
        <button
            className="group relative flex items-center shrink-0 gap-2 w-full h-10 px-3 text-label-sm transition-colors text-sub-600 hover:text-strong-950 not-last:mb-2"
            onClick={onClick}
        >
            <Icon
                className="fill-sub-600 transition-colors group-hover:fill-strong-950"
                name={icon}
            />
            {title}
        </button>
    );
};

export default Button;
