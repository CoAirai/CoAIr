export const chatEase = [0.22, 1, 0.36, 1] as const;

export const chatTransition = {
    duration: 0.28,
    ease: chatEase,
};

export const chatSpring = {
    type: "spring" as const,
    stiffness: 380,
    damping: 34,
    mass: 0.8,
};
