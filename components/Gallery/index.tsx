import Preview from "./Preview";

const Gallery = ({}) => {
    return (
        <div className="relative h-160 max-4xl:h-106 max-md:h-60">
            {[
                "/images/image-2.jpg",
                "/images/image-3.jpg",
                "/images/image-4.jpg",
            ].map((image, index) => (
                <Preview
                    className="w-[calc(50%-0.25rem)] first:top-0 first:left-0 first:bottom-0 not-first:h-[calc(50%-0.25rem)] not-first:right-0 nth-2:top-0 nth-3:bottom-0"
                    image={image}
                    key={index}
                    index={index}
                />
            ))}
        </div>
    );
};

export default Gallery;
