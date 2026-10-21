// Compile-only API shape fixture. Never shipped and never used as a real VEGAS runtime.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Windows.Forms;
namespace ScriptPortal.Vegas {
 public class Vegas {
  public PlugInNode VideoFX=new PlugInNode(); public Project Project=new Project();
  public bool ActivateDockView(string name){return false;}
  public void LoadDockView(DockableControl control){}
 }
 public class DockableControl:UserControl {
  public DockableControl(string name){}
  public string DisplayName{get;set;}
  public bool PersistDockWindowState{get;set;}
  public virtual System.Drawing.Size DefaultFloatingSize{get{return new System.Drawing.Size();}}
  protected virtual void OnLoaded(EventArgs e){}
 }
 public class PlugInNode {
  public string UniqueID,Name; public bool IsContainer;
  public IEnumerator GetChildEnumerator(){return new object[0].GetEnumerator();}
  public PlugInNode GetChildByUniqueID(string id){return null;}
 }
 public class Project {public List<Track> Tracks=new List<Track>();}
 public class Track {public List<TrackEvent> Events=new List<TrackEvent>();public bool IsVideo(){return true;}}
 public class TrackEvent {public bool Selected;}
 public class VideoEvent:TrackEvent {public List<Effect> Effects=new List<Effect>();}
 public class Effect {public Effect(PlugInNode node){} public object OFXEffect{get{return null;}}}
 public class UndoBlock:IDisposable {public UndoBlock(Project project,string name){}public void Dispose(){}}
}
