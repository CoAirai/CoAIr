import { FormEvent, useState } from "react";
import Switch from "@/components/Switch";
import Button from "@/components/Button";
import Field from "@/components/Field";

type Props = {
    changePassword?: (
        current: string,
        next: string
    ) => { ok: boolean; error?: string };
};

const Security = ({ changePassword }: Props) => {
    const [authentication, setAuthentication] = useState(true);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const onSubmitPassword = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!changePassword) return;

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            setSuccess(null);
            return;
        }

        const result = changePassword(currentPassword, newPassword);
        if (!result.ok) {
            setError(result.error ?? "Unable to change password");
            setSuccess(null);
            return;
        }

        setError(null);
        setSuccess("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
    };

    return (
        <div className="">
            {changePassword && (
                <form
                    onSubmit={onSubmitPassword}
                    className="mb-3 pb-3 border-b border-stroke-soft-200"
                >
                    <div className="mb-3">
                        <div className="text-label-md">Change password</div>
                        <div className="text-sub-600">
                            Update your account password.
                        </div>
                    </div>
                    <Field
                        className="mb-3"
                        label="Current password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        isSmall
                    />
                    <Field
                        className="mb-3"
                        label="New password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        isSmall
                    />
                    <Field
                        className="mb-3"
                        label="Confirm new password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        isSmall
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Button className="!h-10 !rounded-[0.625rem]" isBlue>
                            Update password
                        </Button>
                        {success && (
                            <p className="text-label-sm text-green-600">
                                {success}
                            </p>
                        )}
                        {error && (
                            <p className="text-label-sm text-red-500">
                                {error}
                            </p>
                        )}
                    </div>
                </form>
            )}
            <div className="flex justify-between gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="max-w-101">
                    <div className="text-label-md">
                        Mlti-factor authentication
                    </div>
                    <div className="text-sub-600">
                        Require an extra security challenge when logging in. If
                        you are unable to pass this challenge, you will have the
                        option to recover your account via email.
                    </div>
                </div>
                <Switch
                    checked={authentication}
                    onChange={setAuthentication}
                    isSmall
                />
            </div>
            <div className="flex justify-between gap-6 max-md:flex-col max-md:gap-3">
                <div className="max-w-101">
                    <div className="text-label-md">Log out of all devices</div>
                    <div className="text-sub-600">
                        Log out of all active sessions across all devices,
                        including your current session. It may take up to 30
                        minutes for other devices to be logged out.
                    </div>
                </div>
                <Button
                    className="shrink-0 !h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                >
                    Log out all
                </Button>
            </div>
        </div>
    );
};

export default Security;
