import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dayLabel, fmt, fmt0, staffName, today, updateItem, useCollection, useDB, zoneForAddress } from '../services/erp';
import { CrudTable, Kpi, PageHeader, Panel, Pill, Tabs } from '../components/shared/ui';
import type { FieldDef } from '../components/shared/ui';
import { addDays, format, parseISO } from 'date-fns';
import { mapsLink } from '../services/trips';

type Tab = 'zones' | 'accommodations' | 'vehicles' | 'supplies';

export const ResourcesPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const [tab, setTab] = useState<Tab>('zones');
    const { items: zones } = useCollection('zones', companyId);
    const { items: vehicles } = useCollection('vehicles', companyId);
    const { items: homes } = useCollection('accommodations', companyId);
    const { items: supplies } = useCollection('supplies', companyId);
    const { items: usage } = useCollection('supplyUsage', companyId);

    const staff = db.staff.filter(s => s.companyId === companyId);
    const bookings = db.bookings.filter(b => b.companyId === companyId && b.status !== 'cancelled');
    const unzoned = bookings.filter(b => !zoneForAddress(b.address, zones)).length;
    const low = supplies.filter(s => s.stock <= s.minStock);
    const soon = format(addDays(new Date(), 30), 'yyyy-MM-dd');

    const zoneFields: FieldDef[] = [
        { name: 'name', label: 'Zone name', required: true },
        { name: 'areas', label: 'Areas covered', required: true, type: 'textarea', hint: 'Comma separated, for example: West Bay, Pearl, Lusail. Jobs are matched to zones by address.' },
        { name: 'surcharge', label: 'Travel surcharge (QAR)', type: 'number', half: true },
    ];
    const homeFields: FieldDef[] = [
        { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Al Sadd villa' },
        { name: 'address', label: 'Address', required: true, placeholder: 'Street, building, area' },
        { name: 'mapUrl', label: 'Google Maps link', hint: 'Optional. Open the place in Google Maps, press Share, paste the link. Drivers get exact directions.' },
        { name: 'notes', label: 'Notes for the driver', type: 'textarea', placeholder: 'Gate number, where to wait...' },
    ];
    const vehicleFields: FieldDef[] = [
        { name: 'name', label: 'Vehicle name', required: true, half: true },
        { name: 'plate', label: 'Plate number', required: true, half: true },
        { name: 'driverId', label: 'Assigned driver', type: 'select', half: true, options: staff.map(s => ({ value: s.id, label: staffName(db, s.id) })) },
        { name: 'capacity', label: 'Seats', type: 'number', half: true },
        { name: 'status', label: 'Status', type: 'select', required: true, half: true, options: [{ value: 'active', label: 'Active' }, { value: 'maintenance', label: 'In maintenance' }] },
        { name: 'insuranceExpiry', label: 'Insurance expires', type: 'date', half: true },
    ];
    const supplyFields: FieldDef[] = [
        { name: 'name', label: 'Item', required: true },
        { name: 'unit', label: 'Unit', required: true, half: true, placeholder: 'bottle, box, litre' },
        { name: 'stock', label: 'In stock', type: 'number', required: true, half: true },
        { name: 'minStock', label: 'Reorder at', type: 'number', required: true, half: true },
        { name: 'costPerUnit', label: 'Cost per unit (QAR)', type: 'number', required: true, half: true },
    ];

    return (
        <div className="pg">
            <PageHeader title="Zones, vehicles and supplies" subtitle="The things your crews need to get to a job and do it." />
            <div className="kpis">
                <Kpi label="Zones" value={zones.length} hint={unzoned ? `${unzoned} job${unzoned === 1 ? '' : 's'} outside any zone` : 'All jobs are in a zone'} />
                <Kpi label="Active vehicles" value={vehicles.filter(v => v.status === 'active').length} hint={`${vehicles.filter(v => v.status === 'maintenance').length} in maintenance`} />
                <Kpi label="Low stock items" value={low.length} tone={low.length ? 'warn' : undefined} hint={`${supplies.length} items tracked`} />
                <Kpi label="Stock value" value={fmt0(supplies.reduce((s, x) => s + x.stock * x.costPerUnit, 0))} unit="QAR" />
            </div>
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'zones', label: 'Zones' }, { id: 'accommodations', label: 'Accommodations' }, { id: 'vehicles', label: 'Vehicles' }, { id: 'supplies', label: 'Supplies' }]} />

            {tab === 'zones' && (
                <Panel title="Service zones" subtitle="Revenue and job counts come from completed bookings matched by address">
                    <CrudTable collection="zones" companyId={companyId} noun="zone" addLabel="Add zone" fields={zoneFields} defaults={{ surcharge: 0 }}
                        cols={[
                            { key: 'name', header: 'Zone', render: z => <b style={{ fontWeight: 600 }}>{z.name}</b> },
                            { key: 'areas', header: 'Areas' },
                            { key: 'surcharge', header: 'Surcharge', align: 'r', render: z => z.surcharge ? `${fmt(z.surcharge)} QAR` : '-' },
                            { key: 'jobs', header: 'Jobs', align: 'r', render: z => bookings.filter(b => zoneForAddress(b.address, [z]) && b.status === 'completed').length },
                            { key: 'rev', header: 'Revenue', align: 'r', render: z => `${fmt0(bookings.filter(b => zoneForAddress(b.address, [z]) && b.status === 'completed').reduce((s, b) => s + b.price, 0))} QAR` },
                        ]} />
                </Panel>
            )}

            {tab === 'accommodations' && (
                <Panel title="Accommodations" subtitle="Where your cleaners live. Drivers pick them up here before a job and bring them back after. Choose each cleaner's accommodation in Cleaners.">
                    <CrudTable collection="accommodations" companyId={companyId} noun="accommodation" addLabel="Add accommodation" fields={homeFields} defaults={{}}
                        cols={[
                            { key: 'name', header: 'Accommodation', render: h => <b style={{ fontWeight: 600 }}>{h.name}</b> },
                            { key: 'address', header: 'Address' },
                            { key: 'people', header: 'Cleaners', align: 'r', render: h => staff.filter(s => s.accommodationId === h.id).length },
                            { key: 'map', header: 'Map', render: h => <a href={mapsLink(h.address, h.mapUrl)} target="_blank" rel="noopener noreferrer">Open map</a> },
                        ]} />
                    {homes.length > 0 && staff.some(s => !s.accommodationId) && (
                        <p className="tiny" style={{ marginTop: 10 }}>{staff.filter(s => !s.accommodationId).length} team members have no accommodation yet. Set it in Cleaners, Edit.</p>
                    )}
                </Panel>
            )}

            {tab === 'vehicles' && (
                <Panel title="Fleet">
                    <CrudTable collection="vehicles" companyId={companyId} noun="vehicle" addLabel="Add vehicle" fields={vehicleFields} defaults={{ status: 'active', capacity: 4 }}
                        cols={[
                            { key: 'name', header: 'Vehicle', render: v => <b style={{ fontWeight: 600 }}>{v.name}</b> },
                            { key: 'plate', header: 'Plate' },
                            { key: 'driver', header: 'Driver', render: v => staffName(db, v.driverId) || '-' },
                            { key: 'capacity', header: 'Seats', align: 'r' },
                            { key: 'ins', header: 'Insurance', render: v => !v.insuranceExpiry ? '-' : v.insuranceExpiry < today() ? <Pill tone="bad">Expired {dayLabel(v.insuranceExpiry)}</Pill> : v.insuranceExpiry <= soon ? <Pill tone="warn">Expires {dayLabel(v.insuranceExpiry)}</Pill> : dayLabel(v.insuranceExpiry) },
                            { key: 'status', header: 'Status', render: v => <Pill tone={v.status === 'active' ? 'good' : 'warn'}>{v.status === 'active' ? 'Active' : 'Maintenance'}</Pill> },
                        ]} />
                </Panel>
            )}

            {tab === 'supplies' && (
                <div className="stack">
                    <Panel title="Inventory" subtitle="Stock drops automatically when a cleaner logs supplies on a job">
                        <CrudTable collection="supplies" companyId={companyId} noun="supply" addLabel="Add item" fields={supplyFields} defaults={{ stock: 0, minStock: 5, costPerUnit: 0 }}
                            extraRow={s => <button className="btn btn-secondary btn-sm" onClick={() => {
                                const q = Number(prompt(`Restock ${s.name}: how many ${s.unit}s arrived?`, '10'));
                                if (q > 0) updateItem('supplies', s.id, { stock: s.stock + q });
                            }}>Restock</button>}
                            cols={[
                                { key: 'name', header: 'Item', render: s => <b style={{ fontWeight: 600 }}>{s.name}</b> },
                                { key: 'stock', header: 'In stock', align: 'r', render: s => `${s.stock} ${s.unit}` },
                                { key: 'min', header: 'Reorder at', align: 'r', render: s => s.minStock },
                                { key: 'level', header: 'Level', render: s => s.stock <= 0 ? <Pill tone="bad">Out of stock</Pill> : s.stock <= s.minStock ? <Pill tone="warn">Low</Pill> : <Pill tone="good">OK</Pill> },
                                { key: 'cost', header: 'Unit cost', align: 'r', render: s => `${fmt(s.costPerUnit)} QAR` },
                                { key: 'used', header: 'Used (30 days)', align: 'r', render: s => usage.filter(u => u.supplyId === s.id && u.date >= format(addDays(parseISO(today()), -30), 'yyyy-MM-dd')).reduce((a, u) => a + u.qty, 0) },
                            ]} />
                    </Panel>
                </div>
            )}
        </div>
    );
};
