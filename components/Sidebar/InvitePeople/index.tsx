import { useState } from "react";
import Field from "@/components/Field";
import Button from "@/components/Button";

const InvitePeople = ({}) => {
    const [email, setEmail] = useState("");

    return (
        <>
            <div className="mb-2 text-center text-h5">Invite people</div>
            <div className="mb-4 text-p-md text-center text-sub-600">
                Send an invite to your teammates and start collaborating
                together.
            </div>
            <Field
                className="mb-6"
                label="Email"
                placeholder="Enter email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />
            <Button className="w-full h-12" isBlack icon="plus">
                Invite
            </Button>
        </>
    );
};

export default InvitePeople;
