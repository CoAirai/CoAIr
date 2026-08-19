"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { pendingAccessRequests } from "@/lib/admin/accessRequests";
import type { AccessRequest } from "@/lib/admin/accessRequests";
import { buildAlertFeed, type AlertItem } from "@/lib/admin/alertFeed";
import {
    buildCommandIndex,
    type CommandRecord,
} from "@/lib/admin/commandIndex";
import { listAccessRequests, listAdminTickets } from "@/lib/coair/commerce";
import { listAdminInvoices, listAdminTopups } from "@/lib/coair/ops";
import { getLiveAdminCache, useLiveAdmin } from "@/lib/coair/useLiveAdmin";

export function useAdminChrome() {
    const { session } = useAuth();
    const live =
        session?.source === "live" &&
        Boolean(session.accessToken) &&
        session.role === "super_admin";
    const token = session?.accessToken ?? "";
    const { orgs: liveAdminOrgs, users: liveAdminUsers } = useLiveAdmin();
    const {
        companies,
        users,
        invoices,
        tickets,
        accessRequests,
        topUpRequests,
    } = useAdminData();

    const [liveCompanies, setLiveCompanies] = useState<
        Array<{ id: string; name: string; subtitle: string }>
    >([]);
    const [liveUsers, setLiveUsers] = useState<
        Array<{ id: string; name: string; subtitle: string }>
    >([]);
    const [liveInvoices, setLiveInvoices] = useState<
        Array<{ id: string; companyName: string; status: string }>
    >([]);
    const [liveTickets, setLiveTickets] = useState<
        Array<{
            id: string;
            subject: string;
            companyName: string;
            status: string;
        }>
    >([]);
    const [liveAccess, setLiveAccess] = useState<AccessRequest[]>([]);
    const [liveTopUps, setLiveTopUps] = useState<
        Array<{ id: string; companyName: string }>
    >([]);

    const loadLive = useCallback(async () => {
        if (!live || !token) {
            setLiveCompanies([]);
            setLiveUsers([]);
            setLiveInvoices([]);
            setLiveTickets([]);
            setLiveAccess([]);
            setLiveTopUps([]);
            return;
        }
        const cached = getLiveAdminCache(token);
        const orgRows = cached?.orgs ?? liveAdminOrgs;
        const userRows = cached?.users ?? liveAdminUsers;
        const nameById = new Map(
            orgRows.map((org) => [org.org_id, org.name] as const)
        );
        setLiveCompanies(
            orgRows.map((org) => ({
                id: org.org_id,
                name: org.name,
                subtitle: org.slug ?? org.org_id,
            }))
        );
        setLiveUsers(
            userRows.map((user) => ({
                id: user.username,
                name: user.display_name || user.username,
                subtitle: user.org_name
                    ? `${user.username} · ${user.org_name}`
                    : user.username,
            }))
        );
        const [invoiceList, ticketList, requests, topups] =
            await Promise.allSettled([
                listAdminInvoices(token),
                listAdminTickets(token),
                listAccessRequests(token),
                listAdminTopups(token),
            ]);
        setLiveInvoices(
            (invoiceList.status === "fulfilled" ? invoiceList.value : []).map(
                (invoice) => ({
                    id: invoice.id,
                    companyName:
                        nameById.get(invoice.companyId) ?? invoice.companyId,
                    status: invoice.status,
                })
            )
        );
        setLiveTickets(
            (ticketList.status === "fulfilled" ? ticketList.value : []).map(
                (ticket) => ({
                    id: ticket.id,
                    subject: ticket.subject,
                    companyName:
                        nameById.get(ticket.companyId) ?? ticket.companyId,
                    status: ticket.status,
                })
            )
        );
        setLiveAccess(requests.status === "fulfilled" ? requests.value : []);
        setLiveTopUps(
            (topups.status === "fulfilled" ? topups.value : [])
                .filter((request) => request.status === "pending")
                .map((request) => ({
                    id: request.id,
                    companyName:
                        nameById.get(request.companyId) ?? request.companyId,
                }))
        );
    }, [live, token, liveAdminOrgs, liveAdminUsers]);

    useEffect(() => {
        void loadLive();
    }, [loadLive]);

    const mockCompanyName = useMemo(
        () => new Map(companies.map((company) => [company.id, company.name])),
        [companies]
    );

    const records: CommandRecord[] = useMemo(() => {
        if (live) {
            return buildCommandIndex({
                companies: liveCompanies,
                users: liveUsers,
                invoices: liveInvoices,
                tickets: liveTickets,
            });
        }
        return buildCommandIndex({
            companies: companies.map((company) => ({
                id: company.id,
                name: company.name,
                subtitle: company.industry,
            })),
            users: users.map((user) => ({
                id: user.id,
                name: user.name,
                subtitle: user.email,
            })),
            invoices: invoices.map((invoice) => ({
                id: invoice.id,
                companyName:
                    mockCompanyName.get(invoice.companyId) ?? invoice.companyId,
                status: invoice.status,
            })),
            tickets: tickets.map((ticket) => ({
                id: ticket.id,
                subject: ticket.subject,
                companyName:
                    mockCompanyName.get(ticket.companyId) ?? ticket.companyId,
            })),
        });
    }, [
        live,
        liveCompanies,
        liveUsers,
        liveInvoices,
        liveTickets,
        companies,
        users,
        invoices,
        tickets,
        mockCompanyName,
    ]);

    const alerts: AlertItem[] = useMemo(() => {
        if (live) {
            return buildAlertFeed({
                pendingAccess: pendingAccessRequests(liveAccess).map(
                    (request) => ({
                        id: request.id,
                        companyName: request.companyName,
                    })
                ),
                pendingTopUps: liveTopUps,
                openTickets: liveTickets
                    .filter((ticket) => ticket.status === "open")
                    .map((ticket) => ({
                        id: ticket.id,
                        subject: ticket.subject,
                    })),
                pastDueInvoices: liveInvoices
                    .filter((invoice) => invoice.status === "past_due")
                    .map((invoice) => ({
                        id: invoice.id,
                        companyName: invoice.companyName,
                    })),
            });
        }
        return buildAlertFeed({
            pendingAccess: pendingAccessRequests(accessRequests).map(
                (request) => ({
                    id: request.id,
                    companyName: request.companyName,
                })
            ),
            pendingTopUps: topUpRequests
                .filter((request) => request.status === "pending")
                .map((request) => ({
                    id: request.id,
                    companyName:
                        mockCompanyName.get(request.companyId) ??
                        request.companyId,
                })),
            openTickets: tickets
                .filter((ticket) => ticket.status === "open")
                .map((ticket) => ({
                    id: ticket.id,
                    subject: ticket.subject,
                })),
            pastDueInvoices: invoices
                .filter((invoice) => invoice.status === "past_due")
                .map((invoice) => ({
                    id: invoice.id,
                    companyName:
                        mockCompanyName.get(invoice.companyId) ??
                        invoice.companyId,
                })),
        });
    }, [
        live,
        liveAccess,
        liveTopUps,
        liveTickets,
        liveInvoices,
        accessRequests,
        topUpRequests,
        tickets,
        invoices,
        mockCompanyName,
    ]);

    return { records, alerts };
}
