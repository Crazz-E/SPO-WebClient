import { Recorder } from './transport';
import { WireView, memberOf, payloadOf } from './wire-view';

const clock = () => 't';

describe('wire-view — helpers', () => {
  it('memberOf reads the member, strips SET values, names idof targets', () => {
    expect(memberOf('C 12 sel 1 get UserName;')).toBe('UserName');
    expect(memberOf('C 13 sel 1 set EnableEvents="#-1";')).toBe('EnableEvents');
    expect(memberOf('C sel 1 call ClientAware "*";')).toBe('ClientAware');
    expect(memberOf('C 14 idof "WSObjectCacher";')).toBe('idof:WSObjectCacher');
    expect(memberOf('A2 objid="1"')).toBeNull();
    expect(memberOf('garbage sel')).toBeNull();
  });

  it('payloadOf strips the answer prefix and delimiter', () => {
    expect(payloadOf('A12 res="%x"')).toBe('res="%x"');
    expect(payloadOf('A12')).toBe('');
    expect(payloadOf('A12 ;')).toBe('');
  });
});

describe('wire-view — WireView', () => {
  function recorded(): { rec: Recorder; view: WireView } {
    const rec = new Recorder(clock);
    return { rec, view: new WireView(rec) };
  }

  it('pairs requests with their answers since a mark, in order, and reads the last reply', () => {
    const { rec, view } = recorded();
    rec.recordOut('world', 'C 1 sel 5 get Old;');
    rec.recordIn('world', 'A1 Old="#0"');
    const mark = view.mark();
    rec.recordOut('world', 'C 2 sel 5 call ObjectsInArea "^" "#1","#1","#64","#64";');
    rec.recordOut('world', 'C 3 sel 5 call SegmentsInArea "^" "#1","#1","#1","#65","#65";');
    rec.recordIn('world', 'A3 res="%"');
    rec.recordIn('world', 'A2 res="%1\r\n2\r\n3\r\n4\r\n5"');
    rec.recordOut('world', 'C sel 5 call SetViewedArea "*" "#1","#1","#64","#64";');
    rec.recordIn('world', 'C sel 9 call RefreshTycoon "*" "%1","%0","#1","#0","#70"');

    expect(view.since(mark)).toHaveLength(6);
    const ex = view.exchanges(mark);
    expect(ex.map(e => `${e.member}:${e.rid ?? '-'}:${e.reply === null ? 'null' : 'ok'}`)).toEqual([
      'ObjectsInArea:2:ok', 'SegmentsInArea:3:ok', 'SetViewedArea:-:null',
    ]);
    expect(view.lastReply(mark, 'ObjectsInArea')).toBe('res="%1\r\n2\r\n3\r\n4\r\n5"');
    expect(view.lastReply(mark, 'Nope')).toBeNull();
    expect(view.exchanges(mark, 'SetViewedArea')[0].request).toBe('C sel 5 call SetViewedArea "*" "#1","#1","#64","#64"');
    expect(view.pushes(mark)).toEqual(['C sel 9 call RefreshTycoon "*" "%1","%0","#1","#0","#70"']);
    expect(view.pushMembers(mark)).toEqual(['RefreshTycoon']);
    expect(view.frames(mark)[0]).toBe('>> C 2 sel 5 call ObjectsInArea "^" "#1","#1","#64","#64";');
    expect(view.frames(mark)[3]).toBe('<< A2 res="%1\r\n2\r\n3\r\n4\r\n5"');
  });

  it('an unanswered request has a null reply; the mark excludes what came before', () => {
    const { rec, view } = recorded();
    rec.recordOut('world', 'C 1 sel 5 get A;');
    const mark = view.mark();
    rec.recordOut('world', 'C 2 sel 5 get B;');
    expect(view.exchanges(mark)).toEqual([{ member: 'B', rid: 2, request: 'C 2 sel 5 get B', reply: null }]);
    expect(view.exchanges(0)).toHaveLength(2);
  });
});
