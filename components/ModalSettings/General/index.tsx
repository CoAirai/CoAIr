import { useState } from "react";
import Field from "@/components/Field";
import Icon from "@/components/Icon";
import Button from "@/components/Button";
import UploadImage from "./UploadImage";

const General = ({}) => {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");

    return (
        <div className="-mt-5 max-md:mt-0">
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200 max-md:flex-col max-md:items-start max-md:gap-3">
                <div className="mr-auto">
                    <div className="text-label-md">Avatar</div>
                    <div className="text-sub-600">Update full name</div>
                </div>
                <UploadImage />
            </div>
            <div className="mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mb-3">
                    <div className="text-label-md">Personal Information</div>
                    <div className="text-sub-600">
                        Edit your personal information
                    </div>
                </div>
                <Field
                    className="mb-3"
                    label="Full name"
                    placeholder="Enter full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    isSmall
                />
                <Field
                    className="mb-1"
                    label="Email"
                    placeholder="Enter email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    isSmall
                />
                <button className="inline-flex items-center gap-2 text-label-xs text-sub-600 transition-opacity hover:opacity-80">
                    <Icon className="!size-4" name="plus" />
                    Add another
                </button>
            </div>
            <div className="mb-3">
                <div className="mb-3">
                    <div className="text-label-md">Phone number</div>
                    <div className="text-sub-600">Update your phone number</div>
                </div>
                <Field
                    className=""
                    label="Phone number"
                    placeholder="Enter phone number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    isSmall
                />
            </div>
            <div className="flex justify-end gap-3">
                <Button className="!h-10 !px-4.5 !bg-weak-50" isStroke>
                    Discard
                </Button>
                <Button className="!h-10 !px-4.5" isBlack>
                    Save Changes
                </Button>
            </div>
        </div>
    );
};

export default General;
