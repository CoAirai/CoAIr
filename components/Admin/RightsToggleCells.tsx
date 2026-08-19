"use client";

import Icon from "@/components/Icon";
import {
    RIGHT_COLUMNS,
    type RightKey,
} from "@/lib/admin/rolesStub";

type Props = {
    rights: Record<RightKey, boolean>;
    disabled?: boolean;
    onToggle?: (key: RightKey, enabled: boolean) => void;
};

const RightsToggleCells = ({ rights, disabled, onToggle }: Props) => (
    <>
        {RIGHT_COLUMNS.map((column) => {
            const enabled = rights[column.key];
            if (!onToggle) {
                return (
                    <td key={column.key} className="px-5 py-4 text-center">
                        {enabled ? (
                            <Icon className="fill-green-600" name="check" />
                        ) : (
                            <span className="text-sub-600">—</span>
                        )}
                    </td>
                );
            }
            return (
                <td key={column.key} className="px-5 py-4 text-center">
                    <button
                        type="button"
                        disabled={disabled}
                        aria-pressed={enabled}
                        aria-label={`${column.label} ${enabled ? "on" : "off"}`}
                        onClick={() => onToggle(column.key, !enabled)}
                        className={`inline-flex size-8 items-center justify-center rounded-lg border text-label-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            enabled
                                ? "border-green-500/30 bg-green-500/10 text-green-600"
                                : "border-stroke-soft-200 text-sub-600 hover:bg-weak-50"
                        }`}
                    >
                        {enabled ? (
                            <Icon className="fill-green-600" name="check" />
                        ) : (
                            "—"
                        )}
                    </button>
                </td>
            );
        })}
    </>
);

export default RightsToggleCells;
