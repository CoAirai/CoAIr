import Icon from "@/components/Icon";
import Button from "@/components/Button";

type Props = {
    content: React.ReactNode;
    onEdit: () => void;
};

const Article = ({ content, onEdit }: Props) => (
    <div className="bg-white-0 border border-stroke-soft-200 rounded-xl p-4 pb-0 overflow-hidden max-md:p-0 ">
        <div className="flex items-center gap-2 mb-5 max-md:mb-0 max-md:p-3">
            <div className="flex items-center gap-2 mr-auto text-[1rem]">
                <Icon className="fill-strong-950" name="document-check" />
                Document
            </div>
            <Button
                className="max-md:shrink-0 max-md:w-10 max-md:h-10 max-md:p-0 max-md:gap-0 max-md:text-0"
                isStroke
            >
                <svg
                    className="size-5 fill-strong-950"
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                >
                    <path
                        fillRule="evenodd"
                        d="M10.838 11.042c0-.46-.373-.833-.833-.833s-.833.373-.833.833v3.75h-.495c-.146 0-.326 0-.473.018H8.2c-.105.013-.585.073-.814.544s.022.889.077.979l.002.003c.077.128.189.27.281.387l.02.025.881 1.043c.158.163.339.33.532.463.171.118.463.287.822.287s.651-.169.822-.287a3.67 3.67 0 0 0 .532-.463c.317-.326.635-.729.881-1.043l.02-.025.281-.387.002-.003c.055-.09.306-.507.077-.979s-.709-.531-.814-.544h-.003c-.147-.018-.327-.018-.473-.018h-.485v-3.75z"
                    />
                    <path
                        opacity=".4"
                        d="M1.041 10.417c0-2.201 1.484-4.056 3.507-4.617.163-.045.245-.068.292-.116s.068-.13.109-.293a5.21 5.21 0 0 1 10.227.693c.023.204.034.307.086.366s.154.084.356.133c1.917.465 3.34 2.192 3.34 4.252 0 2.416-1.959 4.375-4.375 4.375h-.05c-.183 0-.274 0-.337-.042s-.106-.144-.191-.348c-.105-.251-.262-.486-.469-.687-.276-.268-.608-.445-.957-.53-.259-.063-.388-.095-.442-.163s-.053-.178-.053-.397v-2c0-1.151-.933-2.083-2.083-2.083s-2.083.933-2.083 2.083v2c0 .219 0 .329-.053.397s-.183.1-.442.163c-.349.085-.681.262-.957.53-.208.203-.384.438-.502.691-.097.208-.146.312-.214.352s-.153.032-.324.018c-2.455-.207-4.383-2.266-4.383-4.774z"
                    />
                </svg>
                <span>Donwload Article</span>
            </Button>
            <Button
                className="max-md:shrink-0 max-md:w-10 max-md:h-10 max-md:p-0 max-md:gap-0 max-md:text-0"
                icon="edit"
                isBlack
                onClick={onEdit}
            >
                Edit Article
            </Button>
        </div>
        <div className="content max-h-96 bg-white-0 px-18 py-16 rounded-xl shadow-[0_4px_3.4rem_0_rgba(14,18,27,0.10)] overflow-y-auto scrollbar-none max-2xl:p-12 max-xl:p-8 max-md:px-3 max-md:py-4 dark:shadow-[0_0.25rem_3.4rem_0_rgba(255,255,255,0.10)]">
            {content}
        </div>
    </div>
);

export default Article;
