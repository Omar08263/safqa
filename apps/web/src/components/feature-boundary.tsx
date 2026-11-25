import { Component, type ReactNode, useEffect } from 'react';
import { report, setActiveFeature, useFlag } from '../lib/remote';

class Catch extends Component<{ flag: string; children: ReactNode }, { err: Error | null }> {
  override state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  override componentDidCatch(err: Error) { report('crash', `${err.message}`.slice(0, 280), this.props.flag); }
  override render() {
    if (this.state.err) {
      return (
        <div className="mx-auto max-w-md py-16 text-center" role="alert">
          <p className="text-5xl">🛠️</p>
          <h1 className="mt-3 text-xl font-bold">الميزة دي اتعثرت شوية</h1>
          <p className="mt-2 text-sm text-muted">«حارس» وكيل الأعطال اتبلّغ تلقائيًا، ولو المشكلة عند ناس تانية هيقفلها ويصلّحها. جرّب تاني بعد شوية.</p>
          <button type="button" className="press mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground" onClick={() => this.setState({ err: null })}>حاول تاني</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wraps a feature: hidden when its remote flag is off; crashes are reported with the flag for auto-rollback. */
export function Feature({ flag, children, off }: { flag: string; children: ReactNode; off?: ReactNode }) {
  const on = useFlag(flag);
  useEffect(() => { setActiveFeature(flag); return () => setActiveFeature(null); }, [flag]);
  if (!on) return <>{off ?? <FeatureOff />}</>;
  return <Catch flag={flag}>{children}</Catch>;
}
function FeatureOff() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl">🌙</p>
      <h1 className="mt-3 text-xl font-bold">الميزة دي واخدة استراحة</h1>
      <p className="mt-2 text-sm text-muted">فريق صفقة بيحسّنها دلوقتي وهترجع قريب. جرّب باقي صفقة لحد ما ترجع ✨</p>
    </div>
  );
}
