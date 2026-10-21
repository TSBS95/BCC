// BCC FX Manager: run in VEGAS Pro 23 via Tools > Scripting > Run Script.
// Keeps a dockable folder/search panel open and handles local effect requests on the VEGAS UI thread.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using System.Xml;
using ScriptPortal.Vegas;

public class EntryPoint {
    public void FromVegas(Vegas vegas) {
        if (!vegas.ActivateDockView("BCCFxManager")) vegas.LoadDockView(new BccFxDock(vegas));
    }
}

public sealed class BccFxDock : DockableControl {
    private readonly Vegas vegas;
    private readonly string root;
    private readonly string session = Guid.NewGuid().ToString("N");
    private readonly List<BccEffectInfo> effects = new List<BccEffectInfo>();
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly TextBox search = new TextBox();
    private readonly ComboBox folders = new ComboBox();
    private readonly ListBox list = new ListBox();
    private readonly Label status = new Label();
    private DateTime libraryStamp = DateTime.MinValue;
    private XmlDocument library;
    private bool busy;

    public BccFxDock(Vegas instance) : base("BCCFxManager") {
        vegas = instance;
        root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "BCC FX Manager");
        Directory.CreateDirectory(root);
        DisplayName = "BCC FX Manager";
        BackColor = Color.FromArgb(245,245,245);
        ForeColor = Color.FromArgb(40,40,40);
        Font = new Font("Segoe UI", 9F);
        MinimumSize = new Size(300,350);
        PersistDockWindowState = true;
        TableLayoutPanel layout = new TableLayoutPanel();
        layout.Dock = DockStyle.Fill; layout.Padding = new Padding(12); layout.ColumnCount = 1; layout.RowCount = 7;
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,46));
        Label title = new Label(); title.Text = "BCC FX Manager"; title.Font = new Font("Segoe UI",13F,FontStyle.Bold); title.Dock = DockStyle.Fill;
        search.Dock = DockStyle.Fill; search.AccessibleName = "Search effects";
        folders.Dock = DockStyle.Fill; folders.DropDownStyle = ComboBoxStyle.DropDownList;
        list.Dock = DockStyle.Fill; list.BorderStyle = BorderStyle.FixedSingle; list.IntegralHeight = false;
        Button apply = MakeButton("Apply to selected video events");
        Button refresh = MakeButton("Refresh installed effects");
        status.Dock = DockStyle.Fill; status.Font = new Font("Segoe UI",8F);
        layout.Controls.Add(title,0,0); layout.Controls.Add(search,0,1); layout.Controls.Add(folders,0,2);
        layout.Controls.Add(list,0,3); layout.Controls.Add(apply,0,4); layout.Controls.Add(refresh,0,5); layout.Controls.Add(status,0,6);
        Controls.Add(layout);
        search.TextChanged += delegate { Filter(); };
        folders.SelectedIndexChanged += delegate { Filter(); };
        apply.Click += delegate { ApplyFromPanel(); };
        list.DoubleClick += delegate { ApplyFromPanel(); };
        refresh.Click += delegate { try { ExportCatalogue(); Filter(); status.Text = "Catalogue refreshed."; } catch(Exception e) { status.Text = e.Message; } };
        timer.Interval = 1000; timer.Tick += Tick;
        ExportCatalogue(); ReadFolders();
        status.Text = "Connected. Create folders in the desktop app; they appear here.";
    }
    public override Size DefaultFloatingSize { get { return new Size(440,600); } }
    protected override void OnLoaded(EventArgs e) { base.OnLoaded(e); timer.Start(); }
    protected override void Dispose(bool disposing) { if (disposing) timer.Dispose(); base.Dispose(disposing); }
    private static Button MakeButton(string text) {
        Button b = new Button(); b.Text = text; b.Dock = DockStyle.Fill; b.FlatStyle = FlatStyle.Flat;
        b.BackColor = Color.FromArgb(50,50,50); b.ForeColor = Color.White; b.Margin = new Padding(0,4,0,4); return b;
    }
    private static XmlDocument ReadXml(string file) {
        if (new FileInfo(file).Length > 8*1024*1024) throw new Exception("Bridge file exceeds the size limit.");
        XmlReaderSettings settings = new XmlReaderSettings(); settings.DtdProcessing = DtdProcessing.Prohibit; settings.XmlResolver = null;
        XmlDocument doc = new XmlDocument(); doc.XmlResolver = null;
        using (XmlReader reader = XmlReader.Create(file,settings)) doc.Load(reader);
        return doc;
    }
    private static void AtomicXml(string file, Action<XmlWriter> write) {
        string temporary = file + ".tmp";
        XmlWriterSettings settings = new XmlWriterSettings(); settings.Indent = true; settings.Encoding = new UTF8Encoding(false);
        using (XmlWriter writer = XmlWriter.Create(temporary,settings)) { writer.WriteStartDocument(); write(writer); writer.WriteEndDocument(); }
        if (File.Exists(file)) File.Replace(temporary,file,null); else File.Move(temporary,file);
    }
    private void ReadChildren(PlugInNode parent) {
        IEnumerator children = parent.GetChildEnumerator();
        while (children.MoveNext()) {
            PlugInNode node = (PlugInNode)children.Current;
            if (node.IsContainer) { ReadChildren(node); continue; }
            effects.Add(new BccEffectInfo(node.UniqueID,node.Name));
        }
    }
    private void ExportCatalogue() {
        effects.Clear(); ReadChildren(vegas.VideoFX); effects.Sort(delegate(BccEffectInfo a,BccEffectInfo b) { return string.Compare(a.Name,b.Name,StringComparison.OrdinalIgnoreCase); });
        AtomicXml(Path.Combine(root,"installed-effects.xml"),delegate(XmlWriter w) {
            w.WriteStartElement("bcc-fx-catalogue"); w.WriteAttributeString("version","1");
            foreach (BccEffectInfo e in effects) { w.WriteStartElement("effect"); w.WriteAttributeString("id",e.Id); w.WriteAttributeString("name",e.Name); w.WriteEndElement(); }
            w.WriteEndElement();
        });
    }
    private void ReadFolders() {
        string file = Path.Combine(root,"folders.xml");
        if (File.Exists(file)) {
            DateTime stamp = File.GetLastWriteTimeUtc(file);
            if (stamp == libraryStamp) return;
            library = ReadXml(file); libraryStamp = stamp;
        } else if (folders.Items.Count > 0) return;
        string previous = folders.SelectedItem as string;
        folders.Items.Clear(); folders.Items.Add("All effects"); folders.Items.Add("BCC+"); folders.Items.Add("BCC"); folders.Items.Add("Sapphire"); folders.Items.Add("Favorites");
        if (library != null) foreach(XmlNode f in library.SelectNodes("/folders/folder")) folders.Items.Add("Folder: " + f.Attributes["name"].Value);
        int index = previous == null ? -1 : folders.Items.IndexOf(previous); folders.SelectedIndex = index < 0 ? 0 : index;
        Filter();
    }
    private void Filter() {
        string selected = folders.SelectedItem as string ?? "All effects";
        HashSet<string> allowed = null;
        if (selected == "Favorites" || selected.StartsWith("Folder: ",StringComparison.Ordinal)) {
            allowed = new HashSet<string>();
            if (library != null) {
                XmlNode container = null;
                if (selected == "Favorites") container = library.SelectSingleNode("/folders/favorites");
                else foreach(XmlNode f in library.SelectNodes("/folders/folder")) if(f.Attributes["name"].Value == selected.Substring(8)) { container = f; break; }
                if (container != null) foreach(XmlNode e in container.SelectNodes("effect")) allowed.Add(e.Attributes["id"].Value);
            }
        }
        string[] words = search.Text.Trim().ToLowerInvariant().Split(new char[]{' '},StringSplitOptions.RemoveEmptyEntries);
        list.BeginUpdate(); list.Items.Clear();
        foreach(BccEffectInfo effect in effects) {
            if (allowed != null && !allowed.Contains(effect.Id)) continue;
            string family = effect.Name.StartsWith("BCC+",StringComparison.OrdinalIgnoreCase) || effect.Name.StartsWith("BCC +",StringComparison.OrdinalIgnoreCase) ? "BCC+" : effect.Name.StartsWith("BCC ",StringComparison.OrdinalIgnoreCase) ? "BCC" : effect.Name.StartsWith("S_",StringComparison.OrdinalIgnoreCase) || effect.Name.IndexOf("Sapphire",StringComparison.OrdinalIgnoreCase)>=0 ? "Sapphire" : "Other";
            if ((selected=="BCC+" || selected=="BCC" || selected=="Sapphire") && selected != family) continue;
            bool matches = true; foreach(string word in words) if((effect.Name+" "+family).ToLowerInvariant().IndexOf(word,StringComparison.Ordinal)<0) matches=false;
            if (matches) list.Items.Add(effect);
        }
        list.EndUpdate();
    }
    private void ApplyFromPanel() {
        BccEffectInfo chosen = list.SelectedItem as BccEffectInfo; if(chosen == null) { status.Text = "Choose an effect first."; return; }
        try { status.Text = Apply(chosen.Id,null); } catch(Exception e) { status.Text = e.Message; }
    }
    private void Tick(object sender,EventArgs args) {
        if (busy) return; busy = true;
        try {
            ReadFolders();
            AtomicXml(Path.Combine(root,"state.xml"),delegate(XmlWriter w) {
                w.WriteStartElement("bridge"); w.WriteAttributeString("version","2"); w.WriteAttributeString("session",session); w.WriteAttributeString("utc",DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture)); w.WriteEndElement();
            });
            string file = Path.Combine(root,"request.xml");
            if (!File.Exists(file)) return;
            XmlDocument doc = ReadXml(file); File.Delete(file);
            XmlElement request = doc.DocumentElement;
            if (request == null || request.Name != "request" || request.GetAttribute("session") != session) return;
            string id = request.GetAttribute("id");
            try {
                DateTime expires = DateTime.Parse(request.GetAttribute("expires"),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind);
                if (DateTime.UtcNow > expires.ToUniversalTime()) throw new Exception("The request expired. Nothing was applied.");
                string action = request.GetAttribute("action"), effect = request.GetAttribute("effect");
                if (action == "inspect") WriteControls(id,effect);
                else if(action == "apply") { string message = Apply(effect,request); WriteResponse(id,message,null); status.Text = message; }
                else throw new Exception("Unsupported bridge command.");
            } catch(Exception e) { WriteResponse(id,null,e.Message); status.Text = e.Message; }
        } catch(Exception e) { status.Text = "Bridge: " + e.Message; } finally { busy=false; }
    }
    private void WriteResponse(string id,string message,string error) {
        AtomicXml(Path.Combine(root,"response.xml"),delegate(XmlWriter w) {
            w.WriteStartElement("response"); w.WriteAttributeString("id",id); w.WriteAttributeString("session",session);
            if (error != null) w.WriteAttributeString("error",error); else w.WriteAttributeString("message",message);
            w.WriteEndElement();
        });
    }
    private Effect CreateEffect(string id) {
        PlugInNode node = vegas.VideoFX.GetChildByUniqueID(id);
        if(node == null || node.IsContainer) throw new Exception("This effect is unavailable in this VEGAS session.");
        return new Effect(node);
    }
    private static object Property(object obj,params string[] names) {
        foreach(string name in names) { PropertyInfo p=obj.GetType().GetProperty(name); if(p != null && p.GetIndexParameters().Length==0) { try { return p.GetValue(obj,null); } catch { } } }
        return null;
    }
    private static IEnumerable Parameters(Effect effect) {
        if(effect.OFXEffect == null) return new object[0];
        object ofx=effect.OFXEffect;
        return (Property(ofx,"Parameters") as IEnumerable) ?? (ofx as IEnumerable) ?? new object[0];
    }
    private static BccControl NumericControl(object parameter) {
        string type = parameter.GetType().Name;
        if(type != "OFXDoubleParameter" && type != "OFXIntegerParameter") return null;
        object value = Property(parameter,"Value");
        if(value == null) return null;
        string name = Convert.ToString(Property(parameter,"Name"),CultureInfo.InvariantCulture);
        if(string.IsNullOrEmpty(name)) return null;
        BccControl c = new BccControl(); c.Parameter=parameter; c.Name=name; c.Label=Convert.ToString(Property(parameter,"Label"),CultureInfo.InvariantCulture); if(string.IsNullOrEmpty(c.Label))c.Label=name;
        c.Kind = type == "OFXIntegerParameter" ? "integer" : "double"; c.Value=Convert.ToDouble(value,CultureInfo.InvariantCulture);
        object low=Property(parameter,"Min","Minimum","MinValue"), high=Property(parameter,"Max","Maximum","MaxValue");
        if(low != null && high != null) { c.Min=Convert.ToDouble(low,CultureInfo.InvariantCulture); c.Max=Convert.ToDouble(high,CultureInfo.InvariantCulture); c.Bounded=!double.IsNaN(c.Min)&&!double.IsInfinity(c.Min)&&!double.IsNaN(c.Max)&&!double.IsInfinity(c.Max)&&c.Min<=c.Max; }
        return c;
    }
    private void WriteControls(string requestId,string effectId) {
        Effect effect=CreateEffect(effectId);
        List<BccControl> controls=new List<BccControl>();
        foreach(object parameter in Parameters(effect)) { BccControl c=NumericControl(parameter); if(c!=null)controls.Add(c); }
        AtomicXml(Path.Combine(root,"response.xml"),delegate(XmlWriter w) {
            w.WriteStartElement("response"); w.WriteAttributeString("id",requestId); w.WriteAttributeString("session",session); w.WriteAttributeString("message",controls.Count+" numeric controls read from VEGAS.");
            foreach(BccControl c in controls) {
                w.WriteStartElement("parameter"); w.WriteAttributeString("name",c.Name); w.WriteAttributeString("label",c.Label); w.WriteAttributeString("type",c.Kind); w.WriteAttributeString("default",c.Value.ToString("R",CultureInfo.InvariantCulture));
                if(c.Bounded) { w.WriteAttributeString("min",c.Min.ToString("R",CultureInfo.InvariantCulture)); w.WriteAttributeString("max",c.Max.ToString("R",CultureInfo.InvariantCulture)); }
                w.WriteEndElement();
            }
            w.WriteEndElement();
        });
    }
    private static void SetControls(Effect effect,XmlElement request) {
        if(request==null) return;
        Dictionary<string,BccControl> controls=new Dictionary<string,BccControl>();
        foreach(object p in Parameters(effect)) { BccControl c=NumericControl(p); if(c!=null)controls[c.Name]=c; }
        foreach(XmlNode p in request.SelectNodes("parameter")) {
            string name=p.Attributes["name"].Value; BccControl c;
            if(!controls.TryGetValue(name,out c)||!c.Bounded)throw new Exception("A requested control is unavailable or has no reported numeric range: "+name);
            double value=double.Parse(p.Attributes["value"].Value,CultureInfo.InvariantCulture);
            if(double.IsNaN(value)||double.IsInfinity(value)||value<c.Min||value>c.Max||(c.Kind=="integer"&&value!=Math.Truncate(value)))throw new Exception("Value outside the plugin range: "+name);
            PropertyInfo property=c.Parameter.GetType().GetProperty("Value");
            property.SetValue(c.Parameter,Convert.ChangeType(value,property.PropertyType,CultureInfo.InvariantCulture),null);
        }
    }
    private string Apply(string id,XmlElement request) {
        List<VideoEvent> selected = new List<VideoEvent>();
        foreach(Track track in vegas.Project.Tracks) if(track.IsVideo()) foreach(TrackEvent ev in track.Events) if(ev.Selected && ev is VideoEvent) selected.Add((VideoEvent)ev);
        if(selected.Count==0)throw new Exception("Select one or more video events in VEGAS first.");
        List<Effect> prepared=new List<Effect>();
        foreach(VideoEvent ev in selected) { Effect effect=CreateEffect(id); SetControls(effect,request); prepared.Add(effect); }
        int applied=0;
        using(UndoBlock undo=new UndoBlock(vegas.Project,"BCC FX Manager: apply effect")) {
            try { for(int i=0;i<selected.Count;i++) { selected[i].Effects.Add(prepared[i]); applied++; } }
            catch(Exception e) { throw new Exception("Applied to "+applied+" of "+selected.Count+" events before an error. Use VEGAS Undo to remove this operation. "+e.Message); }
        }
        return "Applied to "+applied+" selected video event(s). Use VEGAS Undo to remove.";
    }
}
public sealed class BccEffectInfo {
    public string Id,Name;
    public BccEffectInfo(string id,string name) { Id=id; Name=name; }
    public override string ToString() { return Name; }
}
public sealed class BccControl {
    public object Parameter; public string Name,Label,Kind; public double Value,Min,Max; public bool Bounded;
}
