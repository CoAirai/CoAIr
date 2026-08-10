import { useTheme } from "next-themes";
import Image from "@/components/Image";

const Theme = ({}) => {
    const { theme, setTheme } = useTheme();

    const themes = [
        {
            id: 1,
            name: "Light mode",
            image: "/images/theme-light.png",
            value: "light",
        },
        {
            id: 2,
            name: "Dark mode",
            image: "/images/theme-dark.png",
            value: "dark",
        },
        {
            id: 3,
            name: "System Preference",
            image: "/images/theme-preference.png",
            value: "system",
        },
    ];

    return (
        <div className="">
            <div className="text-label-md">Themes</div>
            <div className="mb-3 text-sub-600">
                Choose your style or customize your theme
            </div>
            <div className="flex gap-3 max-md:flex-col">
                {themes.map((button) => (
                    <div
                        className={`flex flex-col flex-1 border rounded-lg bg-white-0 overflow-hidden cursor-pointer transition-colors hover:border-blue-500 ${
                            theme === button.value
                                ? "border-blue-500 dark:text-static-black"
                                : "border-stroke-soft-200"
                        }`}
                        key={button.id}
                        onClick={() => setTheme(button.value)}
                    >
                        <div className="p-2.5 py-4">
                            <div className="border border-stroke-soft-200 rounded-lg overflow-hidden">
                                <Image
                                    className="w-full opacity-100"
                                    src={button.image}
                                    width={152}
                                    height={95}
                                    alt=""
                                />
                            </div>
                        </div>
                        <div
                            className={`flex items-center grow gap-2.5 h-11 px-3 transition-colors ${
                                theme === button.value
                                    ? "bg-blue-50"
                                    : "bg-weak-50"
                            }`}
                        >
                            <div
                                className={`flex justify-center items-center size-4.5 rounded-full border ${
                                    theme === button.value
                                        ? "border-blue-500 bg-blue-500"
                                        : "border-stroke-soft-200 bg-white-0"
                                }`}
                            >
                                <svg
                                    className={`fill-static-white transition-opacity ${
                                        theme === button.value
                                            ? "opacity-100"
                                            : "opacity-0"
                                    }`}
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="9"
                                    height="8"
                                    fill="none"
                                    viewBox="0 0 9 8"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M8.252 2.16a.79.79 0 1 0-1.167-1.07l-3.795 4.14-1.394-1.394a.79.79 0 1 0-1.12 1.12l1.979 1.979a.79.79 0 0 0 1.143-.025l4.354-4.75z"
                                    />
                                </svg>
                            </div>
                            <div className="text-label-sm">{button.name}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Theme;
