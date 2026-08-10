import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import Button from "@/components/Button";

const LanguageTranslator = () => {
    return (
        <Chat>
            <Question>
                <div className="mb-1">Translate this text to frensh:</div>
                <div className="">
                    Beneath the quiet hum of a late-night city, a single
                    streetlamp flickered like it was holding on to its last
                    breath. Somewhere nearby, the scent of fresh rain clung to
                    the pavement, mixing with the soft sound of footsteps
                    echoing between empty buildings. It was the kind of night
                    where time felt slower, and the world seemed to hold its
                    breath, waiting for something unspoken to happen.
                </div>
            </Question>
            <Answer>
                <div className="mb-4">Sure here is the text in frensh:</div>
                <div className="text-label-sm">
                    Sous le doux bourdonnement d&apos;une ville tard dans la
                    nuit, un seul lampadaire vacillait comme s&apos;il
                    s&apos;accrochait à son dernier souffle. Non loin de là,
                    l&apos;odeur de la pluie fraîche s&apos;accrochait au
                    bitume, se mêlant au léger bruit de pas résonnant entre les
                    immeubles vides. C’était le genre de nuit où le temps
                    semblait ralentir, et où le monde retenait son souffle,
                    attendant que quelque chose d’indicible se produise.
                </div>
                <Button
                    className="!h-9 mt-6 !rounded-lg !bg-weak-50 max-md:mt-4"
                    icon="language-1"
                    isStroke
                >
                    Change text language
                </Button>
            </Answer>
        </Chat>
    );
};

export default LanguageTranslator;
