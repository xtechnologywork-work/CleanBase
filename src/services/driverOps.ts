/* -------------------------------------------------------------------------- */
/*  Driver actions on the shared store: assign a booking to a driver, press a  */
/*  step, undo it. The plan of times comes from the booking, the service       */
/*  length and the drive time in Business rules.                               */
/* -------------------------------------------------------------------------- */
import type { Booking, MockDatabase } from '../types';
import { addItem, getSettings, logActivity, readCollection, removeItem, staffName, updateItem } from './erp';
import type { Accommodation } from './erp';
import { advance, planTimes, undo } from './trips';
import type { Trip } from './trips';

export interface DriverInfo { id: string; name: string; phone?: string; vehicle?: string; vehicleId?: string }

/** Team members with the Fleet Driver role, with the vehicle assigned to them. */
export function driversOf(db: MockDatabase, companyId: string): DriverInfo[] {
    const vehicles = readCollection('vehicles', companyId);
    return db.staff
        .filter(s => s.companyId === companyId && db.users.find(u => u.id === s.userId)?.role === 'driver')
        .map(s => {
            const v = vehicles.find(x => x.driverId === s.id && x.status === 'active');
            return { id: s.id, name: staffName(db, s.id), phone: s.phone, vehicle: v ? `${v.name} · ${v.plate}` : undefined, vehicleId: v?.id };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything a stop needs: the booking, the client, the cleaner and where the cleaner lives. */
export function tripContext(db: MockDatabase, homes: Accommodation[], t: Pick<Trip, 'bookingId'>) {
    const booking = db.bookings.find(b => b.id === t.bookingId);
    const client = booking ? db.clients.find(c => c.id === booking.clientId) : undefined;
    const cleaner = booking?.cleanerId ? db.staff.find(s => s.id === booking.cleanerId) : undefined;
    const home = cleaner?.accommodationId ? homes.find(h => h.id === cleaner.accommodationId) : undefined;
    const service = booking ? db.services.find(s => s.id === booking.serviceId) : undefined;
    return {
        booking, client, cleaner, home, service,
        cleanerName: cleaner ? staffName(db, cleaner.id) : 'No cleaner assigned',
        clientName: client?.name || 'Client',
        clientAddress: booking?.address || client?.address || '',
    };
}

/** Times for a booking: leave, arrive, collect, home. */
export function planFor(db: MockDatabase, b: Booking) {
    const minutes = db.services.find(s => s.id === b.serviceId)?.durationMinutes || 120;
    const travel = getSettings(b.companyId).travelMinutes ?? 30;
    return planTimes(b.time, minutes, travel);
}

/** Give a booking to a driver. A booking has one trip: a new driver takes over the same trip and keeps its progress. */
export function assignDriver(db: MockDatabase, b: Booking, driverId: string, actor: string, vehicleId?: string): Trip {
    const existing = readCollection('trips', b.companyId).find(t => t.bookingId === b.id);
    const plan = planFor(db, b);
    if (existing) {
        const patch = { driverId, vehicleId, date: b.date, ...plan };
        updateItem('trips', existing.id, patch);
        if (existing.driverId !== driverId) logActivity(b.companyId, actor, 'Changed the driver of a trip', `${staffName(db, driverId)} · ${b.date} ${b.time}`);
        return { ...existing, ...patch };
    }
    const trip = addItem('trips', b.companyId, { bookingId: b.id, driverId, vehicleId, date: b.date, ...plan, stage: 'scheduled', events: [] });
    logActivity(b.companyId, actor, 'Assigned a driver', `${staffName(db, driverId)} · ${b.date} ${b.time}`);
    return trip;
}

/** Take a booking away from its driver. */
export function unassignDriver(t: Trip, actor: string) {
    removeItem('trips', t.id);
    logActivity(t.companyId, actor, 'Removed the driver of a trip', t.date);
}

/** The booking moved (date, time or service): bring the trip plan in line with it. */
export function replan(db: MockDatabase, t: Trip, b: Booking) {
    updateItem('trips', t.id, { date: b.date, ...planFor(db, b) });
}
/** True when the booking was moved after the trip was planned. */
export const needsReplan = (db: MockDatabase, t: Trip, b?: Booking) => {
    if (!b) return false;
    const p = planFor(db, b);
    return t.date !== b.date || t.leaveAt !== p.leaveAt || t.pickupAt !== p.pickupAt;
};

/** Ask the phone where it is, without ever blocking the driver for long. */
export function currentPosition(timeoutMs = 4000): Promise<{ lat: number; lng: number } | undefined> {
    return new Promise(resolve => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(undefined);
        const timer = setTimeout(() => resolve(undefined), timeoutMs);
        navigator.geolocation.getCurrentPosition(
            p => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
            () => { clearTimeout(timer); resolve(undefined); },
            { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs },
        );
    });
}

/** Press the next step. Saved at once; the location is added a moment later when the phone gives it. */
export function pressStep(trips: Trip[], actor: string): void {
    const now = new Date();
    const moved = trips.map(t => advance(t, actor, now));
    moved.forEach(t => updateItem('trips', t.id, { stage: t.stage, events: t.events }));
    void currentPosition().then(loc => {
        if (!loc) return;
        moved.forEach(t => {
            const fresh = readCollection('trips', t.companyId).find(x => x.id === t.id);
            if (!fresh || fresh.stage !== t.stage) return;
            const events = [...fresh.events];
            const last = events[events.length - 1];
            if (!last || last.lat !== undefined) return;
            events[events.length - 1] = { ...last, lat: Math.round(loc.lat * 1e5) / 1e5, lng: Math.round(loc.lng * 1e5) / 1e5 };
            updateItem('trips', t.id, { events });
        });
    });
}

export function undoStep(t: Trip): void {
    const back = undo(t);
    updateItem('trips', t.id, { stage: back.stage, events: back.events });
}
