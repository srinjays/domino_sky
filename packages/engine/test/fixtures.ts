/**
 * Test fixture: the official organiser dataset, loaded from disk.
 * Also a minimal synthetic dataset for targeted unit tests.
 */
import type { OfficialDataset } from '../src/schema.js';

/**
 * Minimal test dataset (4 airports, 3 aircraft, 8 flights) for unit tests.
 * Uses the official field names.
 */
export const TEST_DATASET: OfficialDataset = {
  meta: {
    dataset: 'Test network',
    operating_day: 'test day',
    min_turnaround_minutes: 30,
    seats_per_aircraft: 180,
    notes: [],
  },
  airports: [
    { id: 'DEL', name: 'Delhi', city: 'Delhi', lat: 28.56, lng: 77.1, tier: 'mega_hub', capacity_per_hour: 40 },
    { id: 'BOM', name: 'Mumbai', city: 'Mumbai', lat: 19.09, lng: 72.87, tier: 'mega_hub', capacity_per_hour: 32 },
    { id: 'BLR', name: 'Bengaluru', city: 'Bengaluru', lat: 13.2, lng: 77.71, tier: 'mega_hub', capacity_per_hour: 34 },
    { id: 'HYD', name: 'Hyderabad', city: 'Hyderabad', lat: 17.24, lng: 78.43, tier: 'mega_hub', capacity_per_hour: 30 },
  ],
  flights: [
    { flight_id: 'F01', tail_id: 'AC1', leg_order: 1, origin: 'DEL', destination: 'BOM', dep: '06:00', arr: '08:30', block_minutes: 150, pax: 150, turnaround_before_min: null },
    { flight_id: 'F02', tail_id: 'AC1', leg_order: 2, origin: 'BOM', destination: 'DEL', dep: '09:10', arr: '11:40', block_minutes: 150, pax: 160, turnaround_before_min: 40 },
    { flight_id: 'F03', tail_id: 'AC1', leg_order: 3, origin: 'DEL', destination: 'HYD', dep: '12:20', arr: '14:30', block_minutes: 130, pax: 140, turnaround_before_min: 40 },
    { flight_id: 'F04', tail_id: 'AC1', leg_order: 4, origin: 'HYD', destination: 'DEL', dep: '15:10', arr: '17:20', block_minutes: 130, pax: 130, turnaround_before_min: 40 },
    { flight_id: 'F05', tail_id: 'AC2', leg_order: 1, origin: 'BLR', destination: 'BOM', dep: '07:00', arr: '08:30', block_minutes: 90, pax: 170, turnaround_before_min: null },
    { flight_id: 'F06', tail_id: 'AC2', leg_order: 2, origin: 'BOM', destination: 'BLR', dep: '09:30', arr: '11:00', block_minutes: 90, pax: 150, turnaround_before_min: 60 },
    { flight_id: 'F07', tail_id: 'AC2', leg_order: 3, origin: 'BLR', destination: 'HYD', dep: '11:40', arr: '12:40', block_minutes: 60, pax: 120, turnaround_before_min: 40 },
    { flight_id: 'F08', tail_id: 'AC3', leg_order: 1, origin: 'BOM', destination: 'HYD', dep: '06:30', arr: '08:00', block_minutes: 90, pax: 100, turnaround_before_min: null },
  ],
  connections: [
    { connection_id: 'CX01', airport: 'BOM', from_flight: 'F01', to_flight: 'F06', passengers: 15, min_connect_minutes: 45 },
    { connection_id: 'CX02', airport: 'BOM', from_flight: 'F05', to_flight: 'F02', passengers: 20, min_connect_minutes: 30 },
  ],
  crews: [
    { crew_id: 'CR-A', tail_id: 'AC1', base: 'DEL', duty_start: '05:00', max_duty_mins: 480, flight_ids: ['F01', 'F02'] },
    { crew_id: 'CR-B', tail_id: 'AC1', base: 'DEL', duty_start: '11:20', max_duty_mins: 480, flight_ids: ['F03', 'F04'] },
    { crew_id: 'CR-C', tail_id: 'AC2', base: 'BLR', duty_start: '06:00', max_duty_mins: 480, flight_ids: ['F05', 'F06', 'F07'] },
    { crew_id: 'CR-D', tail_id: 'AC3', base: 'BOM', duty_start: '05:30', max_duty_mins: 480, flight_ids: ['F08'] },
  ],
  spare_aircraft: [
    { tail_id: 'SP1', base: 'BOM', available_from: '07:00', seats: 180 },
  ],
};
