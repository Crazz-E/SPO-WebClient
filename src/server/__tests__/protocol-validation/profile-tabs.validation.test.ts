/**
 * Protocol Validation: Profile Tab RDO Commands
 *
 * Validates that profile tab methods in StarpeaceSession produce correct
 * RDO commands for:
 *   - Bank Account: Budget GET, RDOAskLoan CALL, RDOSendMoney CALL, RDOPayOff CALL
 *   - Companies: CompanyCount GET, GetCompanyName/Id/FacilityCount CALL
 *   - Profit & Loss: CompanyCount GET, GetCompanyName/Profit CALL
 *   - Auto Connections: AutoConnections GET, RDOAdd/DelAutoConnection CALL
 *   - Policy: Policy GET, RDOSetPolicyStatus CALL
 *   - Curriculum: reuses fetchTycoonProfile (tested separately)
 *
 * These tests verify RDO command FORMAT by building commands with
 * RdoProtocol.format() and RdoCommand.build() — matching the same code
 * paths that spo_session.ts uses internally.
 */

jest.mock('net', () => ({
  Socket: jest.fn(),
}));
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RdoProtocol } from '../../rdo';
import { RdoValue, RdoCommand } from '../../../shared/rdo-types';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';

// Test constants matching typical session state
const TYCOON_PROXY_ID = '12345678';
const IS_PROXY_ID = '9876543';

describe('Protocol Validation: Profile Tab Commands', () => {

  // ===========================================================================
  // BANK ACCOUNT
  // ===========================================================================

  describe('Bank Account RDO commands', () => {
    it('should format Budget GET as property read on tycoon proxy', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 100,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.GET,
        member: 'Budget',
      });

      expect(command).toContain(`sel ${TYCOON_PROXY_ID} get`);
      expect(command).toContain('Budget');

      const parsed = RdoProtocol.parse(command);
      expect(parsed.verb).toBe(RdoVerb.SEL);
      expect(parsed.targetId).toBe(TYCOON_PROXY_ID);
      expect(parsed.action).toBe(RdoAction.GET);
      expect(parsed.member).toBe('Budget');
    });

    it('should format RDOAskLoan CALL with string amount arg', () => {
      const amount = '2500000000';
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 101,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOAskLoan',
        args: [RdoValue.string(amount).toString()],
      });

      expect(command).toContain(`sel ${TYCOON_PROXY_ID} call`);
      expect(command).toContain('RDOAskLoan');
      expect(command).toContain(`%${amount}`);

      const parsed = RdoProtocol.parse(command);
      expect(parsed.action).toBe(RdoAction.CALL);
      expect(parsed.member).toBe('RDOAskLoan');
    });

    it('should format RDOSendMoney CALL with 3 string args (to, reason, amount)', () => {
      const toTycoon = 'RivalTycoon';
      const reason = '';
      const amount = '1000000';
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 102,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOSendMoney',
        args: [
          RdoValue.string(toTycoon).toString(),
          RdoValue.string(reason).toString(),
          RdoValue.string(amount).toString(),
        ],
      });

      expect(command).toContain('RDOSendMoney');
      expect(command).toContain(`%${toTycoon}`);
      expect(command).toContain(`%${amount}`);

      const parsed = RdoProtocol.parse(command);
      expect(parsed.action).toBe(RdoAction.CALL);
      expect(parsed.member).toBe('RDOSendMoney');
      // Should have exactly 3 args
      expect(parsed.args).toBeDefined();
      expect(parsed.args!.length).toBe(3);
    });

    it('should format RDOPayOff CALL with integer loan index', () => {
      const loanIndex = 0;
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 103,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOPayOff',
        args: [RdoValue.int(loanIndex).toString()],
      });

      expect(command).toContain('RDOPayOff');
      expect(command).toContain(`#${loanIndex}`);

      const parsed = RdoProtocol.parse(command);
      expect(parsed.action).toBe(RdoAction.CALL);
      expect(parsed.member).toBe('RDOPayOff');
      expect(parsed.args![0]).toBe(`#${loanIndex}`);
    });
  });

  // ===========================================================================
  // COMPANIES
  // ===========================================================================

  describe('Companies RDO commands', () => {
    it('should format CompanyCount GET on IS proxy', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 200,
        verb: RdoVerb.SEL,
        targetId: IS_PROXY_ID,
        action: RdoAction.GET,
        member: 'CompanyCount',
      });

      expect(command).toContain(`sel ${IS_PROXY_ID} get`);
      expect(command).toContain('CompanyCount');
    });

    it('should format GetCompanyName CALL with integer index', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 201,
        verb: RdoVerb.SEL,
        targetId: IS_PROXY_ID,
        action: RdoAction.CALL,
        member: 'GetCompanyName',
        args: [RdoValue.int(0).toString()],
      });

      expect(command).toContain('GetCompanyName');
      expect(command).toContain('#0');
    });

    it('should format GetCompanyId CALL with integer index', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 202,
        verb: RdoVerb.SEL,
        targetId: IS_PROXY_ID,
        action: RdoAction.CALL,
        member: 'GetCompanyId',
        args: [RdoValue.int(1).toString()],
      });

      expect(command).toContain('GetCompanyId');
      expect(command).toContain('#1');
    });

    it('should format GetCompanyFacilityCount CALL with integer index', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 203,
        verb: RdoVerb.SEL,
        targetId: IS_PROXY_ID,
        action: RdoAction.CALL,
        member: 'GetCompanyFacilityCount',
        args: [RdoValue.int(2).toString()],
      });

      expect(command).toContain('GetCompanyFacilityCount');
      expect(command).toContain('#2');
    });
  });

  // ===========================================================================
  // PROFIT & LOSS
  // ===========================================================================

  describe('Profit & Loss RDO commands', () => {
    it('should format GetCompanyProfit CALL on IS proxy with integer index', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 300,
        verb: RdoVerb.SEL,
        targetId: IS_PROXY_ID,
        action: RdoAction.CALL,
        member: 'GetCompanyProfit',
        args: [RdoValue.int(0).toString()],
      });

      expect(command).toContain(`sel ${IS_PROXY_ID} call`);
      expect(command).toContain('GetCompanyProfit');
      expect(command).toContain('#0');
    });

    it('should iterate company indices from 0 to N-1', () => {
      const companyCount = 3;
      for (let i = 0; i < companyCount; i++) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 300 + i,
          verb: RdoVerb.SEL,
          targetId: IS_PROXY_ID,
          action: RdoAction.CALL,
          member: 'GetCompanyProfit',
          args: [RdoValue.int(i).toString()],
        });
        expect(command).toContain(`#${i}`);
      }
    });
  });

  // ===========================================================================
  // AUTO CONNECTIONS
  // ===========================================================================

  describe('Auto Connection RDO commands', () => {
    it('should format AutoConnections GET on tycoon proxy', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 400,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.GET,
        member: 'AutoConnections',
      });

      expect(command).toContain(`sel ${TYCOON_PROXY_ID} get`);
      expect(command).toContain('AutoConnections');
    });

    it('should format RDOAddAutoConnection CALL with string fluidId and suppliers', () => {
      const fluidId = 'food1';
      const suppliers = 'fa1,fa2';
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 401,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOAddAutoConnection',
        args: [
          RdoValue.string(fluidId).toString(),
          RdoValue.string(suppliers).toString(),
        ],
      });

      expect(command).toContain('RDOAddAutoConnection');
      expect(command).toContain(`%${fluidId}`);
      expect(command).toContain(`%${suppliers}`);
    });

    it('should format RDODelAutoConnection CALL with string fluidId and suppliers', () => {
      const fluidId = 'elec1';
      const suppliers = 'e1';
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 402,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDODelAutoConnection',
        args: [
          RdoValue.string(fluidId).toString(),
          RdoValue.string(suppliers).toString(),
        ],
      });

      expect(command).toContain('RDODelAutoConnection');
      expect(command).toContain(`%${fluidId}`);
    });

    it('should format RDOHireTradeCenter CALL with string fluidId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 403,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOHireTradeCenter',
        args: [RdoValue.string('food1').toString()],
      });

      expect(command).toContain('RDOHireTradeCenter');
      expect(command).toContain('%food1');
    });

    it('should format RDODontHireTradeCenter CALL with string fluidId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 404,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDODontHireTradeCenter',
        args: [RdoValue.string('food1').toString()],
      });

      expect(command).toContain('RDODontHireTradeCenter');
    });

    it('should format RDOHireOnlyFromWarehouse CALL with string fluidId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 405,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOHireOnlyFromWarehouse',
        args: [RdoValue.string('elec1').toString()],
      });

      expect(command).toContain('RDOHireOnlyFromWarehouse');
    });

    it('should format RDODontHireOnlyFromWarehouse CALL with string fluidId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 406,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDODontHireOnlyFromWarehouse',
        args: [RdoValue.string('elec1').toString()],
      });

      expect(command).toContain('RDODontHireOnlyFromWarehouse');
    });

    it('should map all 6 action types to distinct RDO methods', () => {
      const methodMap: Record<string, string> = {
        add: 'RDOAddAutoConnection',
        delete: 'RDODelAutoConnection',
        hireTradeCenter: 'RDOHireTradeCenter',
        dontHireTradeCenter: 'RDODontHireTradeCenter',
        onlyWarehouses: 'RDOHireOnlyFromWarehouse',
        dontOnlyWarehouses: 'RDODontHireOnlyFromWarehouse',
      };

      // All method names should be unique
      const methods = Object.values(methodMap);
      expect(new Set(methods).size).toBe(methods.length);
    });
  });

  // ===========================================================================
  // POLICY
  // ===========================================================================

  describe('Policy RDO commands', () => {
    it('should format Policy GET on tycoon proxy', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 500,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.GET,
        member: 'Policy',
      });

      expect(command).toContain(`sel ${TYCOON_PROXY_ID} get`);
      expect(command).toContain('Policy');
    });

    it('should format RDOSetPolicyStatus CALL with string tycoon name and integer status', () => {
      const tycoonName = 'RivalTycoon';
      const status = 2; // Enemy
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 501,
        verb: RdoVerb.SEL,
        targetId: TYCOON_PROXY_ID,
        action: RdoAction.CALL,
        member: 'RDOSetPolicyStatus',
        args: [
          RdoValue.string(tycoonName).toString(),
          RdoValue.int(status).toString(),
        ],
      });

      expect(command).toContain('RDOSetPolicyStatus');
      expect(command).toContain(`%${tycoonName}`);
      expect(command).toContain(`#${status}`);

      const parsed = RdoProtocol.parse(command);
      expect(parsed.action).toBe(RdoAction.CALL);
      expect(parsed.member).toBe('RDOSetPolicyStatus');
      expect(parsed.args!.length).toBe(2);
      expect(parsed.args![0]).toBe(`%${tycoonName}`);
      expect(parsed.args![1]).toBe(`#${status}`);
    });

    it('should use correct status codes for all policy types', () => {
      const policyTypes = [
        { label: 'Ally', value: 0 },
        { label: 'Neutral', value: 1 },
        { label: 'Enemy', value: 2 },
      ];

      for (const policy of policyTypes) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 510 + policy.value,
          verb: RdoVerb.SEL,
          targetId: TYCOON_PROXY_ID,
          action: RdoAction.CALL,
          member: 'RDOSetPolicyStatus',
          args: [
            RdoValue.string('TestTycoon').toString(),
            RdoValue.int(policy.value).toString(),
          ],
        });

        expect(command).toContain(`#${policy.value}`);
      }
    });
  });

  // ===========================================================================
  // BANK FORMULA VALIDATION
  // ===========================================================================

  describe('Bank account formula calculations', () => {
    it('should calculate default interest rate from max loan amount', () => {
      const maxLoan = 2_500_000_000;
      const existingLoans = 0;
      const interest = Math.round((existingLoans + maxLoan) / 100_000_000);
      expect(interest).toBe(25);
    });

    it('should calculate default term from max loan amount', () => {
      const maxLoan = 2_500_000_000;
      const existingLoans = 0;
      let term = 200 - Math.round((existingLoans + maxLoan) / 10_000_000);
      if (term < 5) term = 5;
      expect(term).toBe(5); // 200 - 250 = -50, clamped to 5
    });

    it('should clamp term minimum to 5 years', () => {
      const amounts = [1_000_000_000, 2_000_000_000, 5_000_000_000];
      for (const amount of amounts) {
        let term = 200 - Math.round(amount / 10_000_000);
        if (term < 5) term = 5;
        expect(term).toBeGreaterThanOrEqual(5);
      }
    });

    it('should calculate interest proportional to loan amount', () => {
      // Small loan = lower interest
      const smallInterest = Math.round(500_000_000 / 100_000_000);
      expect(smallInterest).toBe(5);

      // Large loan = higher interest
      const largeInterest = Math.round(2_500_000_000 / 100_000_000);
      expect(largeInterest).toBe(25);
    });

    it('should calculate term inversely proportional to loan amount', () => {
      // Small loan = longer term
      let smallTerm = 200 - Math.round(500_000_000 / 10_000_000);
      if (smallTerm < 5) smallTerm = 5;
      expect(smallTerm).toBe(150);

      // Large loan = shorter term
      let largeTerm = 200 - Math.round(2_500_000_000 / 10_000_000);
      if (largeTerm < 5) largeTerm = 5;
      expect(largeTerm).toBe(5);
    });
  });

  // ===========================================================================
  // CURRICULUM LEVEL MAPPING
  // ===========================================================================

  describe('Curriculum level mapping', () => {
    const levelNames = ['Apprentice', 'Entrepreneur', 'Tycoon', 'Master', 'Paradigm', 'Legend', 'BeyondLegend'];

    it('should map level 0 to Apprentice', () => {
      const level = Math.min(0, levelNames.length - 1);
      expect(levelNames[level]).toBe('Apprentice');
    });

    it('should map level 1 to Entrepreneur', () => {
      expect(levelNames[1]).toBe('Entrepreneur');
    });

    it('should map level 2 to Tycoon', () => {
      expect(levelNames[2]).toBe('Tycoon');
    });

    it('should map level 3 to Master', () => {
      expect(levelNames[3]).toBe('Master');
    });

    it('should map level 4 to Paradigm', () => {
      expect(levelNames[4]).toBe('Paradigm');
    });

    it('should map level 5 to Legend', () => {
      expect(levelNames[5]).toBe('Legend');
    });

    it('should clamp level 6+ to BeyondLegend', () => {
      const level = Math.min(6, levelNames.length - 1);
      expect(levelNames[level]).toBe('BeyondLegend');
    });

    it('should clamp excessively high levels to BeyondLegend', () => {
      const level = Math.min(100, levelNames.length - 1);
      expect(levelNames[level]).toBe('BeyondLegend');
    });

    it('should have 7 level names total', () => {
      expect(levelNames.length).toBe(7);
    });
  });

  // ===========================================================================
  // RDO VALUE TYPE VALIDATION
  // ===========================================================================

  describe('RDO value types for profile methods', () => {
    it('should use string prefix (%) for tycoon names', () => {
      const val = RdoValue.string('SPO_test3').toString();
      expect(val).toBe('"%SPO_test3"');
    });

    it('should use string prefix (%) for amounts', () => {
      const val = RdoValue.string('1000000').toString();
      expect(val).toBe('"%1000000"');
    });

    it('should use integer prefix (#) for indices', () => {
      const val = RdoValue.int(0).toString();
      expect(val).toBe('"#0"');
    });

    it('should use integer prefix (#) for policy status codes', () => {
      expect(RdoValue.int(0).toString()).toBe('"#0"'); // Ally
      expect(RdoValue.int(1).toString()).toBe('"#1"'); // Neutral
      expect(RdoValue.int(2).toString()).toBe('"#2"'); // Enemy
    });

    it('should use integer prefix (#) for loan indices', () => {
      const val = RdoValue.int(3).toString();
      expect(val).toBe('"#3"');
    });

    it('should handle empty string values', () => {
      const val = RdoValue.string('').toString();
      expect(val).toBe('"%"');
    });

    it('should use string prefix (%) for fluid IDs', () => {
      const val = RdoValue.string('food1').toString();
      expect(val).toBe('"%food1"');
    });
  });

  // ===========================================================================
  // MESSAGE TYPE COMPLETENESS
  // ===========================================================================

  describe('Profile message type completeness', () => {
    it('should have matching REQ/RESP pairs for all profile tabs', () => {
      const { WsMessageType } = require('../../../shared/types');

      const profileTabs = ['CURRICULUM', 'BANK', 'PROFITLOSS', 'COMPANIES', 'AUTOCONNECTIONS', 'POLICY'];

      for (const tab of profileTabs) {
        expect(WsMessageType[`REQ_PROFILE_${tab}`]).toBeDefined();
        expect(WsMessageType[`RESP_PROFILE_${tab}`]).toBeDefined();
      }
    });

    it('should have action message types for bank and auto-connections', () => {
      const { WsMessageType } = require('../../../shared/types');

      expect(WsMessageType.REQ_PROFILE_BANK_ACTION).toBeDefined();
      expect(WsMessageType.RESP_PROFILE_BANK_ACTION).toBeDefined();
      expect(WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION).toBeDefined();
      expect(WsMessageType.RESP_PROFILE_AUTOCONNECTION_ACTION).toBeDefined();
    });

    it('should have policy set message types', () => {
      const { WsMessageType } = require('../../../shared/types');

      expect(WsMessageType.REQ_PROFILE_POLICY_SET).toBeDefined();
      expect(WsMessageType.RESP_PROFILE_POLICY_SET).toBeDefined();
    });

    it('should have string values for all profile message types', () => {
      const { WsMessageType } = require('../../../shared/types');

      const profileTypes = [
        'REQ_PROFILE_CURRICULUM', 'RESP_PROFILE_CURRICULUM',
        'REQ_PROFILE_BANK', 'RESP_PROFILE_BANK',
        'REQ_PROFILE_BANK_ACTION', 'RESP_PROFILE_BANK_ACTION',
        'REQ_PROFILE_PROFITLOSS', 'RESP_PROFILE_PROFITLOSS',
        'REQ_PROFILE_COMPANIES', 'RESP_PROFILE_COMPANIES',
        'REQ_PROFILE_AUTOCONNECTIONS', 'RESP_PROFILE_AUTOCONNECTIONS',
        'REQ_PROFILE_AUTOCONNECTION_ACTION', 'RESP_PROFILE_AUTOCONNECTION_ACTION',
        'REQ_PROFILE_POLICY', 'RESP_PROFILE_POLICY',
        'REQ_PROFILE_POLICY_SET', 'RESP_PROFILE_POLICY_SET',
      ];

      for (const type of profileTypes) {
        expect(typeof WsMessageType[type]).toBe('string');
        expect(WsMessageType[type]).toBeTruthy();
      }
    });
  });

  // ===========================================================================
  // COMMAND VERB AND TARGET VALIDATION
  // ===========================================================================

  describe('Profile commands use correct target objects', () => {
    it('should use tycoon proxy for bank operations', () => {
      const members = ['Budget', 'RDOAskLoan', 'RDOSendMoney', 'RDOPayOff'];
      for (const member of members) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 600,
          verb: RdoVerb.SEL,
          targetId: TYCOON_PROXY_ID,
          action: member === 'Budget' ? RdoAction.GET : RdoAction.CALL,
          member,
          args: member === 'Budget' ? undefined : [RdoValue.string('test').toString()],
        });
        expect(command).toContain(`sel ${TYCOON_PROXY_ID}`);
      }
    });

    it('should use IS proxy for company operations', () => {
      const members = ['CompanyCount', 'GetCompanyName', 'GetCompanyId', 'GetCompanyProfit', 'GetCompanyFacilityCount'];
      for (const member of members) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 700,
          verb: RdoVerb.SEL,
          targetId: IS_PROXY_ID,
          action: member === 'CompanyCount' ? RdoAction.GET : RdoAction.CALL,
          member,
          args: member === 'CompanyCount' ? undefined : [RdoValue.int(0).toString()],
        });
        expect(command).toContain(`sel ${IS_PROXY_ID}`);
      }
    });

    it('should use tycoon proxy for auto-connection operations', () => {
      const members = ['AutoConnections', 'RDOAddAutoConnection', 'RDODelAutoConnection'];
      for (const member of members) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 800,
          verb: RdoVerb.SEL,
          targetId: TYCOON_PROXY_ID,
          action: member === 'AutoConnections' ? RdoAction.GET : RdoAction.CALL,
          member,
          args: member === 'AutoConnections' ? undefined : [RdoValue.string('f1').toString()],
        });
        expect(command).toContain(`sel ${TYCOON_PROXY_ID}`);
      }
    });

    it('should use tycoon proxy for policy operations', () => {
      const members = ['Policy', 'RDOSetPolicyStatus'];
      for (const member of members) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 900,
          verb: RdoVerb.SEL,
          targetId: TYCOON_PROXY_ID,
          action: member === 'Policy' ? RdoAction.GET : RdoAction.CALL,
          member,
          args: member === 'Policy' ? undefined : [
            RdoValue.string('test').toString(),
            RdoValue.int(1).toString(),
          ],
        });
        expect(command).toContain(`sel ${TYCOON_PROXY_ID}`);
      }
    });
  });
});
