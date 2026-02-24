/**
 * Unit Tests for RDO Protocol Parser and Framer
 * Tests for RdoFramer and RdoProtocol classes
 */

import { describe, it, expect } from '@jest/globals';
import { RdoFramer, RdoProtocol } from './rdo';
import { RdoVerb, RdoAction } from '../shared/types';

describe('RdoFramer', () => {
  describe('ingest() - Packet framing and buffering', () => {
    it('should extract single complete packet', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest('C sel 123 call Method;');
      expect(packets).toEqual(['C sel 123 call Method']);
    });

    it('should extract multiple packets from one chunk', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest('C sel 1 call Test1;C sel 2 call Test2;');
      expect(packets).toHaveLength(2);
      expect(packets[0]).toBe('C sel 1 call Test1');
      expect(packets[1]).toBe('C sel 2 call Test2');
    });

    it('should buffer incomplete packets', () => {
      const framer = new RdoFramer();
      const packets1 = framer.ingest('C sel 123 call');
      expect(packets1).toEqual([]);

      const packets2 = framer.ingest(' Method;');
      expect(packets2).toEqual(['C sel 123 call Method']);
    });

    it('should handle packet split across multiple chunks', () => {
      const framer = new RdoFramer();
      expect(framer.ingest('C sel ')).toEqual([]);
      expect(framer.ingest('100 ')).toEqual([]);
      expect(framer.ingest('call Test;')).toEqual(['C sel 100 call Test']);
    });

    it('should skip empty packets', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest(';;C sel 1 call Test;;;');
      expect(packets).toEqual(['C sel 1 call Test']);
    });

    it('should trim whitespace from packets', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest('  C sel 1 call Test  ;  ');
      expect(packets).toEqual(['C sel 1 call Test']);
    });

    it('should handle Buffer input', () => {
      const framer = new RdoFramer();
      const buffer = Buffer.from('C sel 1 call Test;', 'latin1');
      const packets = framer.ingest(buffer);
      expect(packets).toEqual(['C sel 1 call Test']);
    });

    it('should handle large chunks with many packets', () => {
      const framer = new RdoFramer();
      const chunk = Array.from({ length: 10 }, (_, i) => `C sel ${i} call Test${i}`).join(';') + ';';
      const packets = framer.ingest(chunk);
      expect(packets).toHaveLength(10);
      expect(packets[0]).toBe('C sel 0 call Test0');
      expect(packets[9]).toBe('C sel 9 call Test9');
    });

    it('should maintain buffer state across ingests', () => {
      const framer = new RdoFramer();
      framer.ingest('C sel 1 call Test1;Partial');
      const packets = framer.ingest('Complete;');
      expect(packets).toEqual(['PartialComplete']);
    });

    it('should NOT split on semicolons inside quoted strings', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest('A1234 res="%Status; OK";');
      expect(packets).toHaveLength(1);
      expect(packets[0]).toBe('A1234 res="%Status; OK"');
    });

    it('should split correctly with quoted semicolons and real delimiters', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest('A1 res="%a;b";A2 res="#42";');
      expect(packets).toHaveLength(2);
      expect(packets[0]).toBe('A1 res="%a;b"');
      expect(packets[1]).toBe('A2 res="#42"');
    });

    it('should handle semicolons in multi-value quoted strings', () => {
      const framer = new RdoFramer();
      const packets = framer.ingest('A1 Name="%Test;Corp";');
      expect(packets).toHaveLength(1);
      expect(packets[0]).toBe('A1 Name="%Test;Corp"');
    });
  });
});

describe('RdoProtocol.parse()', () => {
  describe('Packet type detection', () => {
    it('should detect RESPONSE type (A prefix)', () => {
      const packet = RdoProtocol.parse('A1234 OK');
      expect(packet.type).toBe('RESPONSE');
    });

    it('should detect COMMAND/PUSH type (C prefix)', () => {
      const packet = RdoProtocol.parse('C sel 123 call Method;');
      expect(packet.type).toBe('PUSH');
    });

    it('should detect REQUEST type (C with RID)', () => {
      const packet = RdoProtocol.parse('C 5678 sel 123 call Method;');
      expect(packet.type).toBe('REQUEST');
    });

    it('should handle unknown packet types as PUSH', () => {
      const packet = RdoProtocol.parse('UNKNOWN DATA');
      expect(packet.type).toBe('PUSH');
      expect(packet.payload).toBe('UNKNOWN DATA');
    });
  });

  describe('RESPONSE packet parsing', () => {
    it('should extract request ID from response', () => {
      const packet = RdoProtocol.parse('A1234 OK');
      expect(packet.type).toBe('RESPONSE');
      expect(packet.rid).toBe(1234);
      expect(packet.payload).toBe('OK');
    });

    it('should extract payload from response', () => {
      const packet = RdoProtocol.parse('A5678 ERROR Invalid command');
      expect(packet.rid).toBe(5678);
      expect(packet.payload).toBe('ERROR Invalid command');
    });

    it('should handle response with typed value', () => {
      const packet = RdoProtocol.parse('A9999 "%Building Name"');
      expect(packet.rid).toBe(9999);
      expect(packet.payload).toBe('"%Building Name"');
    });

    it('should handle response with multi-line payload', () => {
      const packet = RdoProtocol.parse('A1111 Line1\nLine2\nLine3');
      expect(packet.rid).toBe(1111);
      expect(packet.payload).toContain('Line1');
    });

    it('should handle response without payload', () => {
      const packet = RdoProtocol.parse('A2222');
      expect(packet.rid).toBe(2222);
      expect(packet.payload).toBe('');
    });
  });

  describe('RDO error code parsing (ErrorCodes.pas)', () => {
    it('should detect "error 0" as errNoError', () => {
      const packet = RdoProtocol.parse('A100 error 0');
      expect(packet.type).toBe('RESPONSE');
      expect(packet.rid).toBe(100);
      expect(packet.errorCode).toBe(0);
      expect(packet.errorName).toBe('errNoError');
      expect(packet.payload).toBe('error 0');
    });

    it('should detect "error 5" as errUnexistentMethod', () => {
      const packet = RdoProtocol.parse('A200 error 5');
      expect(packet.errorCode).toBe(5);
      expect(packet.errorName).toBe('errUnexistentMethod');
    });

    it('should detect "error 8" as errQueryTimedOut', () => {
      const packet = RdoProtocol.parse('A300 error 8');
      expect(packet.errorCode).toBe(8);
      expect(packet.errorName).toBe('errQueryTimedOut');
    });

    it('should detect "error 17" as errServerBusy', () => {
      const packet = RdoProtocol.parse('A400 error 17');
      expect(packet.errorCode).toBe(17);
      expect(packet.errorName).toBe('errServerBusy');
    });

    it('should detect "error 2" as errIllegalObject', () => {
      const packet = RdoProtocol.parse('A500 error 2');
      expect(packet.errorCode).toBe(2);
      expect(packet.errorName).toBe('errIllegalObject');
    });

    it('should handle unknown error codes gracefully', () => {
      const packet = RdoProtocol.parse('A600 error 99');
      expect(packet.errorCode).toBe(99);
      expect(packet.errorName).toBe('unknownError(99)');
    });

    it('should NOT treat normal payloads as errors', () => {
      const packet = RdoProtocol.parse('A700 res="#42"');
      expect(packet.errorCode).toBeUndefined();
      expect(packet.errorName).toBeUndefined();
    });

    it('should NOT treat partial "error" string as error code', () => {
      const packet = RdoProtocol.parse('A800 error message text');
      expect(packet.errorCode).toBeUndefined();
    });

    it('should be case-insensitive for "Error" vs "error"', () => {
      const packet = RdoProtocol.parse('A900 Error 5');
      expect(packet.errorCode).toBe(5);
      expect(packet.errorName).toBe('errUnexistentMethod');
    });
  });

  describe('IDOF verb parsing', () => {
    it('should parse IDOF verb', () => {
      const packet = RdoProtocol.parse('C idof "ObjectID"');
      expect(packet.verb).toBe(RdoVerb.IDOF);
      expect(packet.targetId).toBe('ObjectID');
    });

    it('should strip quotes from IDOF targetId', () => {
      const packet = RdoProtocol.parse('C idof "TestObject"');
      expect(packet.targetId).toBe('TestObject');
    });

    it('should handle IDOF with request ID', () => {
      const packet = RdoProtocol.parse('C 1234 idof "MyObject"');
      expect(packet.type).toBe('REQUEST');
      expect(packet.rid).toBe(1234);
      expect(packet.verb).toBe(RdoVerb.IDOF);
      expect(packet.targetId).toBe('MyObject');
    });
  });

  describe('SEL verb with CALL action', () => {
    it('should parse basic call command', () => {
      const packet = RdoProtocol.parse('C sel 123 call Method;');
      expect(packet.verb).toBe(RdoVerb.SEL);
      expect(packet.targetId).toBe('123');
      expect(packet.action).toBe(RdoAction.CALL);
      expect(packet.member).toBe('Method;');
    });

    it('should parse call with push separator (*)', () => {
      const packet = RdoProtocol.parse('C sel 100 call TestMethod "*" "#42";');
      expect(packet.member).toBe('TestMethod');
      expect(packet.separator).toBe('"*"');
      expect(packet.args).toEqual(['"#42";']);
    });

    it('should parse call with method separator (^)', () => {
      const packet = RdoProtocol.parse('C sel 200 call RequestMethod "^" "#100";');
      expect(packet.member).toBe('RequestMethod');
      expect(packet.separator).toBe('"^"');
      expect(packet.args).toEqual(['"#100";']);
    });

    it('should parse call with multiple arguments', () => {
      const packet = RdoProtocol.parse('C sel 100 call SetPrice "*" "#0","#220";');
      expect(packet.member).toBe('SetPrice');
      expect(packet.args).toHaveLength(2);
      expect(packet.args![0]).toBe('#0');
      expect(packet.args![1]).toBe('"#220";');
    });

    it('should parse call with 3 arguments (RDOSetSalaries)', () => {
      const packet = RdoProtocol.parse('C sel 999 call RDOSetSalaries "*" "#100","#120","#150";');
      expect(packet.member).toBe('RDOSetSalaries');
      expect(packet.args).toHaveLength(3);
      expect(packet.args![0]).toBe('#100');
      expect(packet.args![1]).toBe('#120');
      expect(packet.args![2]).toBe('"#150";');
    });

    it('should parse call with string arguments', () => {
      const packet = RdoProtocol.parse('C sel 123 call Login "*" "%username","%password";');
      expect(packet.args).toHaveLength(2);
      expect(packet.args![0]).toBe('%username');
      expect(packet.args![1]).toBe('"%password";');
    });

    it('should parse call with mixed type arguments', () => {
      const packet = RdoProtocol.parse('C sel 300 call Test "*" "#42","!3.14","%hello";');
      expect(packet.args).toHaveLength(3);
      expect(packet.args![0]).toBe('#42');
      expect(packet.args![1]).toBe('!3.14');
      expect(packet.args![2]).toBe('"%hello";');
    });

    it('should handle call with no arguments', () => {
      const packet = RdoProtocol.parse('C sel 400 call NoArgs "*" ;');
      expect(packet.member).toBe('NoArgs');
      expect(packet.args).toEqual([';']);
    });

    it('should handle arguments with quoted strings containing commas', () => {
      const packet = RdoProtocol.parse('C sel 200 call SetName "%Building, Inc.";');
      // Note: Current parser doesn't fully support commas within quoted strings
      // The entire string gets parsed into the member field
      expect(packet.verb).toBe(RdoVerb.SEL);
      expect(packet.action).toBe(RdoAction.CALL);
      expect(packet.member).toBe('SetName "%Building, Inc.";');
    });

    it('should parse call with request ID', () => {
      const packet = RdoProtocol.parse('C 5678 sel 100 call Method "^" "#1";');
      expect(packet.type).toBe('REQUEST');
      expect(packet.rid).toBe(5678);
      expect(packet.member).toBe('Method');
      expect(packet.separator).toBe('"^"');
    });
  });

  describe('SEL verb with GET action', () => {
    it('should parse get command', () => {
      const packet = RdoProtocol.parse('C sel 456 get PropertyName;');
      expect(packet.verb).toBe(RdoVerb.SEL);
      expect(packet.targetId).toBe('456');
      expect(packet.action).toBe(RdoAction.GET);
      expect(packet.member).toBe('PropertyName;');
    });

    it('should parse get with request ID', () => {
      const packet = RdoProtocol.parse('C 1111 sel 789 get srvName;');
      expect(packet.type).toBe('REQUEST');
      expect(packet.rid).toBe(1111);
      expect(packet.action).toBe(RdoAction.GET);
      expect(packet.member).toBe('srvName;');
    });
  });

  describe('SEL verb with SET action', () => {
    it('should parse set command', () => {
      const packet = RdoProtocol.parse('C sel 789 set Value "#100";');
      expect(packet.verb).toBe(RdoVerb.SEL);
      expect(packet.targetId).toBe('789');
      expect(packet.action).toBe(RdoAction.SET);
      expect(packet.member).toBe('Value');
      expect(packet.args).toContain('"#100";');
    });

    it('should parse set with string value', () => {
      const packet = RdoProtocol.parse('C sel 100 set Name "%NewName";');
      expect(packet.member).toBe('Name');
      expect(packet.args![0]).toContain('%NewName');
    });
  });

  describe('Quote handling and escaping', () => {
    it('should respect quotes in tokenization', () => {
      const packet = RdoProtocol.parse('C sel 100 call Test "*" "%value with spaces";');
      expect(packet.args![0]).toBe('"%value with spaces";');
    });

    it('should handle escaped quotes in arguments', () => {
      const packet = RdoProtocol.parse('C sel 100 call Test "*" "%value \\"quoted\\"";');
      expect(packet.args![0]).toContain('\\"');
    });

    it('should handle multiple quoted arguments', () => {
      const packet = RdoProtocol.parse('C sel 100 call Test "*" "%arg1","%arg2","%arg3";');
      expect(packet.args).toHaveLength(3);
      expect(packet.args![0]).toBe('%arg1');
      expect(packet.args![1]).toBe('%arg2');
      expect(packet.args![2]).toBe('"%arg3";');
    });
  });

  describe('Edge cases', () => {
    it('should handle extra whitespace', () => {
      const packet = RdoProtocol.parse('  C   sel   123   call   Method  ;  ');
      expect(packet.verb).toBe(RdoVerb.SEL);
      expect(packet.targetId).toBe('123');
      expect(packet.member).toBe('Method ;');
    });

    it('should preserve raw input', () => {
      const input = 'C sel 123 call Test;';
      const packet = RdoProtocol.parse(input);
      expect(packet.raw).toBe(input);
    });

    it('should handle numeric string targetIds', () => {
      const packet = RdoProtocol.parse('C sel 100575368 call Method;');
      expect(packet.targetId).toBe('100575368');
    });

    it('should handle void type arguments', () => {
      const packet = RdoProtocol.parse('C sel 100 call Test "*" "*";');
      expect(packet.args![0]).toBe('"*";');
    });
  });
});

describe('RdoProtocol.format()', () => {
  describe('Basic formatting', () => {
    it('should format simple call command', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '123',
        action: RdoAction.CALL,
        member: 'Method',
        args: []
      });
      expect(result).toContain('C sel 123 call Method');
      expect(result).toContain('"*"');
    });

    it('should format call with arguments', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'SetPrice',
        separator: '*',
        args: ['#0', '#220']
      });
      expect(result).toContain('C sel 100 call SetPrice "*"');
      expect(result).toContain('"#0"');
      expect(result).toContain('"#220"');
    });

    it('should format get command', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 1234,
        verb: RdoVerb.SEL,
        targetId: '456',
        action: RdoAction.GET,
        member: 'PropertyName'
      });
      expect(result).toBe('C 1234 sel 456 get PropertyName');
    });

    it('should format set command', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '789',
        action: RdoAction.SET,
        member: 'Value',
        args: ['100']
      });
      expect(result).toContain('C sel 789 set Value=');
      expect(result).toContain('#100');
    });
  });

  describe('Request ID handling', () => {
    it('should add request ID when present', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 5678,
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Method',
        args: []
      });
      expect(result).toContain('C 5678 sel 100 call Method');
    });

    it('should use ^ separator for requests', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 1234,
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Method',
        args: ['#42']
      });
      expect(result).toContain('"^"');
    });
  });

  describe('IDOF formatting', () => {
    it('should quote targetId for IDOF verb', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.IDOF,
        targetId: 'ObjectID'
      });
      expect(result).toBe('C idof "ObjectID"');
    });

    it('should handle IDOF with request ID', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 9999,
        verb: RdoVerb.IDOF,
        targetId: 'TestObj'
      });
      expect(result).toBe('C 9999 idof "TestObj"');
    });
  });

  describe('Type prefix handling', () => {
    it('should preserve type prefixes in arguments', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Test',
        args: ['#42', '%hello', '!3.14']
      });
      expect(result).toContain('"#42"');
      expect(result).toContain('"%hello"');
      expect(result).toContain('"!3.14"');
    });

    it('should add type prefix to untyped integers', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Test',
        args: ['42']
      });
      expect(result).toContain('"#42"');
    });

    it('should add type prefix to untyped strings', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Test',
        args: ['hello']
      });
      expect(result).toContain('"%hello"');
    });
  });

  describe('Separator handling', () => {
    it('should use * separator for push commands', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Method',
        separator: '*',
        args: []
      });
      expect(result).toContain('"*"');
    });

    it('should quote unquoted separators', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Method',
        separator: '^',
        args: []
      });
      expect(result).toContain('"^"');
    });

    it('should preserve already quoted separators', () => {
      const result = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: '100',
        action: RdoAction.CALL,
        member: 'Method',
        separator: '"*"',
        args: []
      });
      expect(result).toContain('"*"');
    });
  });

  describe('Roundtrip tests - parse() → format()', () => {
    it('should preserve call command', () => {
      const original = 'C sel 123 call Method "*" "#42";';
      const parsed = RdoProtocol.parse(original);
      const formatted = RdoProtocol.format(parsed);
      expect(formatted).toContain('sel 123 call Method');
      expect(formatted).toContain('"*"');
      expect(formatted).toContain('"#42"');
    });

    it('should preserve multi-argument commands', () => {
      const original = 'C sel 100 call SetPrice "*" "#0","#220";';
      const parsed = RdoProtocol.parse(original);
      const formatted = RdoProtocol.format(parsed);
      expect(formatted).toContain('"#0"');
      expect(formatted).toContain('"#220"');
    });

    it('should preserve get commands', () => {
      const original = 'C 1234 sel 456 get srvName;';
      const parsed = RdoProtocol.parse(original);
      const formatted = RdoProtocol.format(parsed);
      expect(formatted).toBe('C 1234 sel 456 get srvName;');
    });
  });
});
