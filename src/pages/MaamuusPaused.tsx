import { Link } from "react-router-dom";

const MaamuusPaused = () => (
  <main className="min-h-[80vh] bg-background flex items-center justify-center px-6">
    <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-foreground">Maamuus si ku-meel-gaar ah ayuu u xiran yahay</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Adeegga Maamuus (*212*) waa la hakiyey ilaa amar dambe. Fadlan dooro
        xirmooyinka kale ee internet-ka.
      </p>
      <Link
        to="/providers"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-medium text-primary-foreground"
      >
        Ku noqo shirkadaha
      </Link>
    </div>
  </main>
);

export default MaamuusPaused;
