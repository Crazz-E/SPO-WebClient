/**
 * Tests for Transport UI types, message protocol, and railroad constants
 */

import { describe, it, expect } from '@jest/globals';
import { WsMessageType } from '../../shared/types/message-types';
import { ROAD_CONSTANTS } from '../../shared/constants';
import type {
  TrainInfo,
  TrainRouteStop,
  TransportData,
  TrainStatus,
  WsReqTransportData,
  WsRespTransportData,
} from '../../shared/types';

// =============================================================================
// RAILROAD CONSTANTS
// =============================================================================

describe('Railroad Constants', () => {
  it('should have CIRCUIT_ID for roads', () => {
    expect(ROAD_CONSTANTS.CIRCUIT_ID).toBe(1);
  });

  it('should have RAILROAD_CIRCUIT_ID for railroads', () => {
    expect(ROAD_CONSTANTS.RAILROAD_CIRCUIT_ID).toBe(2);
  });

  it('should have different circuit IDs for roads and railroads', () => {
    expect(ROAD_CONSTANTS.CIRCUIT_ID).not.toBe(ROAD_CONSTANTS.RAILROAD_CIRCUIT_ID);
  });
});

// =============================================================================
// TRANSPORT DATA TYPES
// =============================================================================

describe('Transport Data Types', () => {
  it('should build TrainRouteStop', () => {
    const stop: TrainRouteStop = {
      stationName: 'Central Station',
      x: 150,
      y: 200,
      stopOrder: 1,
    };
    expect(stop.stationName).toBe('Central Station');
    expect(stop.stopOrder).toBe(1);
  });

  it('should build TrainInfo with all fields', () => {
    const train: TrainInfo = {
      trainId: 42,
      name: 'Express Line 1',
      ownerName: 'TestTycoon',
      status: 'moving',
      x: 100,
      y: 200,
      routeStops: [
        { stationName: 'Station A', x: 100, y: 200, stopOrder: 1 },
        { stationName: 'Station B', x: 300, y: 400, stopOrder: 2 },
      ],
    };
    expect(train.trainId).toBe(42);
    expect(train.name).toBe('Express Line 1');
    expect(train.status).toBe('moving');
    expect(train.routeStops).toHaveLength(2);
  });

  it('should support all train statuses', () => {
    const statuses: TrainStatus[] = ['idle', 'moving', 'loading', 'unloading'];
    for (const status of statuses) {
      const train: TrainInfo = {
        trainId: 1,
        name: 'Test',
        ownerName: 'Owner',
        status,
        x: 0,
        y: 0,
        routeStops: [],
      };
      expect(train.status).toBe(status);
    }
  });

  it('should build TransportData with trains and rail segment count', () => {
    const data: TransportData = {
      trains: [
        {
          trainId: 1,
          name: 'Freight 1',
          ownerName: 'Player1',
          status: 'idle',
          x: 50,
          y: 75,
          routeStops: [],
        },
      ],
      railSegmentCount: 24,
    };
    expect(data.trains).toHaveLength(1);
    expect(data.railSegmentCount).toBe(24);
  });

  it('should build empty TransportData', () => {
    const data: TransportData = {
      trains: [],
      railSegmentCount: 0,
    };
    expect(data.trains).toHaveLength(0);
    expect(data.railSegmentCount).toBe(0);
  });
});

// =============================================================================
// TRANSPORT WEBSOCKET MESSAGES
// =============================================================================

describe('Transport WebSocket Messages', () => {
  it('should have REQ_TRANSPORT_DATA message type', () => {
    expect(WsMessageType.REQ_TRANSPORT_DATA).toBe('REQ_TRANSPORT_DATA');
  });

  it('should have RESP_TRANSPORT_DATA message type', () => {
    expect(WsMessageType.RESP_TRANSPORT_DATA).toBe('RESP_TRANSPORT_DATA');
  });

  it('should build correct transport data request', () => {
    const req: WsReqTransportData = {
      type: WsMessageType.REQ_TRANSPORT_DATA,
    };
    expect(req.type).toBe('REQ_TRANSPORT_DATA');
  });

  it('should build correct transport data response', () => {
    const resp: WsRespTransportData = {
      type: WsMessageType.RESP_TRANSPORT_DATA,
      data: {
        trains: [{
          trainId: 1,
          name: 'Test Train',
          ownerName: 'Admin',
          status: 'idle',
          x: 0,
          y: 0,
          routeStops: [
            { stationName: 'Start', x: 10, y: 20, stopOrder: 1 },
            { stationName: 'End', x: 30, y: 40, stopOrder: 2 },
          ],
        }],
        railSegmentCount: 12,
      },
    };
    expect(resp.type).toBe('RESP_TRANSPORT_DATA');
    expect(resp.data.trains).toHaveLength(1);
    expect(resp.data.railSegmentCount).toBe(12);
    expect(resp.data.trains[0].routeStops).toHaveLength(2);
  });

  it('should serialize transport response to JSON correctly', () => {
    const resp: WsRespTransportData = {
      type: WsMessageType.RESP_TRANSPORT_DATA,
      data: {
        trains: [{
          trainId: 5,
          name: 'JSON Train',
          ownerName: 'Player',
          status: 'loading',
          x: 100,
          y: 200,
          routeStops: [],
        }],
        railSegmentCount: 8,
      },
    };
    const json = JSON.parse(JSON.stringify(resp));
    expect(json.type).toBe('RESP_TRANSPORT_DATA');
    expect(json.data.trains[0].name).toBe('JSON Train');
    expect(json.data.trains[0].status).toBe('loading');
    expect(json.data.railSegmentCount).toBe(8);
  });

  it('should identify REQ_TRANSPORT_DATA as a request type', () => {
    expect(WsMessageType.REQ_TRANSPORT_DATA).toMatch(/^REQ_/);
  });

  it('should identify RESP_TRANSPORT_DATA as a response type', () => {
    expect(WsMessageType.RESP_TRANSPORT_DATA).toMatch(/^RESP_/);
  });
});

// =============================================================================
// TRANSPORT PANEL LOGIC
// =============================================================================

describe('Transport Panel - View Logic', () => {
  it('should categorize trains by status', () => {
    const trains: TrainInfo[] = [
      { trainId: 1, name: 'T1', ownerName: 'O', status: 'idle', x: 0, y: 0, routeStops: [] },
      { trainId: 2, name: 'T2', ownerName: 'O', status: 'moving', x: 0, y: 0, routeStops: [] },
      { trainId: 3, name: 'T3', ownerName: 'O', status: 'moving', x: 0, y: 0, routeStops: [] },
      { trainId: 4, name: 'T4', ownerName: 'O', status: 'loading', x: 0, y: 0, routeStops: [] },
    ];
    const byStatus = new Map<string, TrainInfo[]>();
    for (const t of trains) {
      const list = byStatus.get(t.status) || [];
      list.push(t);
      byStatus.set(t.status, list);
    }
    expect(byStatus.get('idle')).toHaveLength(1);
    expect(byStatus.get('moving')).toHaveLength(2);
    expect(byStatus.get('loading')).toHaveLength(1);
    expect(byStatus.get('unloading')).toBeUndefined();
  });

  it('should sort route stops by stopOrder', () => {
    const stops: TrainRouteStop[] = [
      { stationName: 'C', x: 0, y: 0, stopOrder: 3 },
      { stationName: 'A', x: 0, y: 0, stopOrder: 1 },
      { stationName: 'B', x: 0, y: 0, stopOrder: 2 },
    ];
    const sorted = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    expect(sorted[0].stationName).toBe('A');
    expect(sorted[1].stationName).toBe('B');
    expect(sorted[2].stationName).toBe('C');
  });

  it('should detect empty train list', () => {
    const data: TransportData = { trains: [], railSegmentCount: 5 };
    expect(data.trains.length === 0).toBe(true);
    expect(data.railSegmentCount).toBeGreaterThan(0);
  });

  it('should filter trains by owner', () => {
    const trains: TrainInfo[] = [
      { trainId: 1, name: 'T1', ownerName: 'Alice', status: 'idle', x: 0, y: 0, routeStops: [] },
      { trainId: 2, name: 'T2', ownerName: 'Bob', status: 'idle', x: 0, y: 0, routeStops: [] },
      { trainId: 3, name: 'T3', ownerName: 'Alice', status: 'moving', x: 0, y: 0, routeStops: [] },
    ];
    const aliceTrains = trains.filter(t => t.ownerName === 'Alice');
    expect(aliceTrains).toHaveLength(2);
  });

  it('should escape HTML in train names for XSS prevention', () => {
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const malicious = '<script>alert("xss")</script>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });
});
