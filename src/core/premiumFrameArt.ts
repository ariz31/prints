/**
 * Artist-grade decorative frame geometry, shared by editor SVG, PNG canvas and PDF.
 *
 * Every primitive is in millimetres, all colors are print-ready opaque hex,
 * and every repeated motif has a strict upper bound for low-memory devices.
 * No raster assets, network requests or server-side generation.
 *
 * The gallery deliberately uses different border compositions, rather than
 * the former generic rectangle + repeated pictogram treatment.
 */
import type { FrameCategory, FramePoint, FramePrimitive } from "./frames.ts";

type Paint = string | undefined;
type Mode = "fine" | "double" | "corners" | "beaded" | "deco" | "lattice" | "garland" | "canopy" | "scallop" | "medallion";
interface Recipe { motif: string; mode: Mode; density?: number; secondary?: string }
const RECIPES: Readonly<Record<string, Recipe>> = {
  "hairline": { motif:"dot",mode:"fine" },
  "double-line": { motif:"diamond",mode:"double" },
  "corner-lines": { motif:"bracket",mode:"corners" },
  "dashed": { motif:"dash",mode:"lattice" },
  "dotted": { motif:"pearl",mode:"beaded" },
  "open-corners": { motif:"bracket",mode:"deco" },
  "pinstripe": { motif:"diamond",mode:"double" },
  "classic-corners": { motif:"scroll",mode:"corners" },
  "deco": { motif:"fan",mode:"deco" },
  "filigree": { motif:"scroll",mode:"garland" },
  "vintage-dots": { motif:"pearl",mode:"beaded" },
  "stately": { motif:"crest",mode:"medallion" },
  "diamonds": { motif:"diamond",mode:"lattice" },
  "triangles": { motif:"triangle",mode:"lattice" },
  "zigzag": { motif:"chevron",mode:"lattice" },
  "squares": { motif:"tiles",mode:"lattice" },
  "hexagons": { motif:"hex",mode:"lattice" },
  "herringbone": { motif:"weave",mode:"lattice" },
  "leaf-tips": { motif:"eucalyptus",mode:"corners" },
  "corner-sprigs": { motif:"olive",mode:"corners" },
  "leaf-garland": { motif:"olive",mode:"garland" },
  "flower-corners": { motif:"rose",mode:"corners" },
  "floral-garland": { motif:"blossom",mode:"garland" },
  "vines": { motif:"ivy",mode:"canopy" },
  "confetti": { motif:"confetti",mode:"scallop" },
  "stars": { motif:"star",mode:"medallion" },
  "hearts": { motif:"heart",mode:"garland" },
  "bunting": { motif:"flag",mode:"canopy" },
  "party-lights": { motif:"bulb",mode:"scallop" },
  "sparkle": { motif:"spark",mode:"deco" },
  "christmas-holly": { motif:"holly",mode:"corners",secondary:"fir" },
  "christmas-evergreen": { motif:"fir",mode:"canopy",secondary:"holly" },
  "christmas-candy-cane": { motif:"candy",mode:"double",secondary:"star" },
  "christmas-baubles": { motif:"bauble",mode:"scallop",secondary:"fir" },
  "christmas-wreaths": { motif:"wreath",mode:"medallion",secondary:"holly" },
  "winter-snowflakes": { motif:"snow",mode:"garland",secondary:"star" },
  "winter-frost": { motif:"frost",mode:"corners",secondary:"snow" },
  "winter-nordic": { motif:"knit",mode:"lattice",secondary:"diamond" },
  "winter-ice": { motif:"ice",mode:"deco",secondary:"snow" },
  "winter-stars": { motif:"star",mode:"medallion",secondary:"spark" },
  "summer-palms": { motif:"palm",mode:"corners",secondary:"wave" },
  "summer-waves": { motif:"wave",mode:"canopy",secondary:"sun" },
  "summer-seashells": { motif:"shell",mode:"garland",secondary:"wave" },
  "summer-sunshine": { motif:"sun",mode:"medallion",secondary:"spark" },
  "summer-hibiscus": { motif:"hibiscus",mode:"corners",secondary:"palm" },
  "halloween-pumpkins": { motif:"pumpkin",mode:"medallion",secondary:"bat" },
  "halloween-bats": { motif:"bat",mode:"canopy",secondary:"star" },
  "halloween-webs": { motif:"web",mode:"corners",secondary:"bat" },
  "halloween-ghosts": { motif:"ghost",mode:"garland",secondary:"star" },
  "halloween-witch": { motif:"witch",mode:"deco",secondary:"spark" },
  "spring-cherry": { motif:"cherry",mode:"garland",secondary:"olive" },
  "spring-butterflies": { motif:"butterfly",mode:"corners",secondary:"blossom" },
  "spring-tulips": { motif:"tulip",mode:"canopy",secondary:"olive" },
  "spring-daisies": { motif:"daisy",mode:"garland",secondary:"butterfly" },
  "spring-easter-eggs": { motif:"egg",mode:"scallop",secondary:"cherry" },
  "autumn-maple": { motif:"maple",mode:"corners",secondary:"acorn" },
  "autumn-wheat": { motif:"wheat",mode:"canopy",secondary:"acorn" },
  "autumn-acorns": { motif:"acorn",mode:"garland",secondary:"maple" },
  "autumn-mushrooms": { motif:"mushroom",mode:"scallop",secondary:"falling" },
  "autumn-foliage": { motif:"falling",mode:"garland",secondary:"maple" },
};
const PALETTES: Record<FrameCategory, readonly [string,string,string]> = {
  Minimal:["#e3cda7","#c7b491","#f5ede0"],
  Classic:["#bc9861","#825e45","#e3cf9e"],
  Geometric:["#a0bfbc","#476b7d","#d3e7e4"],
  Botanical:["#729b7b","#b5bd83","#e7d6b2"],
  Celebratory:["#e2ac4c","#d97983","#83babc"],
  Christmas:["#286e50","#bd3647","#dcb86e"],
  Winter:["#7dacc7","#b7d9e7","#6689ab"],
  Summer:["#208e9c","#e9956a","#f4c45d"],
  Halloween:["#e8944d","#8661a6","#47394c"],
  Spring:["#d987a9","#7ca783","#e9c26f"],
  Autumn:["#bf704c","#d9aa61","#80664b"],
};
const TAU=Math.PI*2;
/** Print-safe highlight and shadow pigments; remain real vector colors in PDF. */
const tone=(hex:string,to:"#ffffff"|"#24342d",fraction:number):string=>{
  const from=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const target=[1,3,5].map(i=>parseInt(to.slice(i,i+2),16));
  return "#"+from.map((v,i)=>Math.round(v+(target[i]-v)*fraction)
    .toString(16).padStart(2,"0")).join("");
};
type Vec=[number,number];
type Vecs=readonly Vec[];
export function createPremiumFrameGeometry(
  id: string, category: FrameCategory, widthMm: number, heightMm: number, weight: number, inset: number, spacingFactor: number
): FramePrimitive[] {
  const recipe=RECIPES[id];
  if(!recipe)throw new Error("Unknown premium frame design.");
  const outerOffset=Math.min(widthMm,heightMm)*inset;
  const width=widthMm-2*outerOffset,height=heightMm-2*outerOffset,u=Math.min(width,height);
  const m=u*.086, sw=u*.0030*weight, out:FramePrimitive[]=[];
  const [primary,secondary,highlight]=PALETTES[category];
  const line=(x1:number,y1:number,x2:number,y2:number,color?:Paint,thickness=1)=>{
    out.push({kind:"line",x1,y1,x2,y2,strokeWidth:sw*thickness,accentColor:color});
  };
  const shape=(pts:FramePoint[],filled=false,color?:Paint,thickness=1,closed=true)=>{
    out.push(closed?{kind:"polygon",points:pts,fill:filled,strokeWidth:sw*thickness,accentColor:color}:
      {kind:"polyline",points:pts,strokeWidth:sw*thickness,accentColor:color});
  };
  const oval=(x:number,y:number,rx:number,ry=rx,color?:Paint,filled=false,thickness=1)=>{
    out.push({kind:"ellipse",cx:x,cy:y,rx,ry,fill:filled,strokeWidth:sw*thickness,accentColor:color});
  };
  const border=(margin:number,color?:Paint,thickness=.8)=>{
    out.push({kind:"rect",x:margin,y:margin,width:width-margin*2,height:height-margin*2,strokeWidth:sw*thickness,accentColor:color});
  };
  const regular=(cx:number,cy:number,r:number,n:number,phase=0,color?:Paint,filled=false)=>{
    const pts=Array.from({length:n},(_,i)=>({x:cx+Math.cos(phase+i*TAU/n)*r,y:cy+Math.sin(phase+i*TAU/n)*r}));
    shape(pts,filled,color);
  };
  const cubic=(a:FramePoint,b:FramePoint,c:FramePoint,d:FramePoint,color?:Paint,thickness=1)=>{
    const pts:FramePoint[]=[];
    for(let i=0;i<=22;i++){const t=i/22,v=1-t;pts.push({x:v*v*v*a.x+3*v*v*t*b.x+3*v*t*t*c.x+t*t*t*d.x,
      y:v*v*v*a.y+3*v*v*t*b.y+3*v*t*t*c.y+t*t*t*d.y});}
    shape(pts,false,color,thickness,false);
  };
  // The glyph renderer is a small original vector illustration library.
  // Its local coordinates are in [-1,1] and all transforms are deterministic.
  const glyph=(kind:string,x:number,y:number,r:number,rotation=0,variant=0)=>{
    const ca=Math.cos(rotation),sa=Math.sin(rotation);
    const t=(xx:number,yy:number):FramePoint=>({x:x+r*(xx*ca-yy*sa),y:y+r*(xx*sa+yy*ca)});
    const p=(points:Vecs,color:Paint=primary,fill=false,thickness=.75,closed=true)=>
      shape(points.map(([xx,yy])=>t(xx,yy)),fill,color,thickness,closed);
    const l=(x1:number,y1:number,x2:number,y2:number,color:Paint=primary,thickness=.85)=>{
      const a=t(x1,y1),b=t(x2,y2);line(a.x,a.y,b.x,b.y,color,thickness);
    };
    const c=(xx:number,yy:number,rx:number,ry=rx,color:Paint=primary,fill=false,thickness=.75)=>{
      const v=t(xx,yy);oval(v.x,v.y,rx*r,ry*r,color,fill,thickness);
    };
    const bez=(a:Vec,b:Vec,d:Vec,e:Vec,color:Paint=primary,thickness=.75)=>{
      cubic(t(...a),t(...b),t(...d),t(...e),color,thickness);
    };
    const star=(rays=5,inner=.43,color:Paint=highlight,fill=false,angle=-Math.PI/2)=>{
      const pts:Vec[]=[];
      for(let j=0;j<rays*2;j++){const q=angle+j*Math.PI/rays,z=j%2?inner:1;pts.push([Math.cos(q)*z,Math.sin(q)*z]);}
      p(pts,color,fill,.7);
    };
    const petal=(angle:number,fill=primary)=>{
      const cs=Math.cos(angle),sn=Math.sin(angle);
      const rot=(xx:number,yy:number):Vec=>[xx*cs-yy*sn,xx*sn+yy*cs];
      // Two smoothly sampled Beziers form a botanical petal, not a polygonal wedge.
      const sample=(a:Vec,b:Vec,c0:Vec,d:Vec):Vec[]=>Array.from({length:13},(_,i)=>{
        const q=i/12,v=1-q;
        return [v*v*v*a[0]+3*v*v*q*b[0]+3*v*q*q*c0[0]+q*q*q*d[0],
          v*v*v*a[1]+3*v*v*q*b[1]+3*v*q*q*c0[1]+q*q*q*d[1]];
      });
      const pts=[...sample([.13,-.055],[.29,-.43],[.74,-.50],[.97,0]),
        ...sample([.97,0],[.72,.49],[.30,.43],[.13,.055]).slice(1)].map(v=>rot(v[0],v[1]));
      p(pts,fill,true,.48);
      const q=rot(.79,0);
      l(.16*cs,.16*sn,q[0],q[1],tone(highlight,"#ffffff",.42),.38);
      // A single specular streak acts as a focal highlight; avoid repeating
      // micro-engraving on every petal of dense A3 garlands.
      if(Math.cos(angle)>.55){
        const a=rot(.42,-.14),b=rot(.64,-.11);
        l(...a,...b,tone(fill,"#ffffff",.55),.26);
      }
    };
    const foliage=(type:"olive"|"eucalyptus"|"fir"|"ivy"|"wheat",color=primary)=>{
      bez([-.95,.6],[-.50,.20],[.35,-.20],[.93,-.78],color,.8);
      for(let j=0;j<4;j++){
        const f=j/3,z=-.64+f*1.25;
        const yy=.30-f*.77;
        const leafSize=type==="fir"?.31:type==="wheat"?.27:.37;
        if(type==="fir"){
          l(z,yy,z-.22,yy-.52,color,.85);
          l(z,yy,z+.36,yy+.31,color,.85);
          l(z-.035,yy-.08,z-.16,yy-.37,tone(color,"#ffffff",.48),.32);
          l(z+.08,yy+.05,z+.27,yy+.23,tone(color,"#ffffff",.48),.32);
        }else if(type==="wheat"){
          p([[z,yy],[z-.26,yy-.13],[z-.11,yy-.53],[z+.09,yy-.16]],highlight,true,.5);
          p([[z,yy],[z+.30,yy+.09],[z+.21,yy+.43],[z-.02,yy+.14]],color,true,.5);
          l(z-.045,yy-.10,z-.12,yy-.33,tone(highlight,"#ffffff",.45),.30);
          l(z+.08,yy+.09,z+.20,yy+.30,tone(color,"#ffffff",.45),.30);
        }else{
          const left=type==="eucalyptus"?secondary:color;
          const right=type==="ivy"?secondary:color;
          p([[z,yy],[z-leafSize*.52,yy-leafSize*.90],[z-leafSize*1.18,yy-leafSize*.58],
             [z-leafSize*.78,yy+leafSize*.15]],left,true,.45);
          p([[z,yy],[z+leafSize*.74,yy+leafSize*.13],[z+leafSize*1.02,yy+leafSize*.79],
             [z+leafSize*.05,yy+leafSize*.44]],right,true,.45);
          // Central veins and one luminous ridge make the foliage read as
          // individually illustrated leaves even at print-size resolution.
          l(z-.04,yy-.03,z-leafSize*.88,yy-leafSize*.50,tone(left,"#ffffff",.52),.34);
          l(z+.06,yy+.05,z+leafSize*.70,yy+leafSize*.60,tone(right,"#ffffff",.50),.34);
        }
      }
    };
    switch(kind){
      case "dot":c(0,0,.11,.11,primary,true);break;
      case "pearl":
        c(0,0,.44,.44,secondary,true);c(-.11,-.11,.14,.14,highlight,true);break;
      case "dash":
        p([[-.8,-.16],[.8,-.16],[.8,.16],[-.8,.16]],primary,true,.5);break;
      case "bracket":
        l(-.95,.60,-.95,-.9,primary,1.2);l(-.95,-.9,.6,-.9,primary,1.2);
        p([[.40,-.90],[.7,-.60],[.40,-.3],[.1,-.6]],secondary,true);break;
      case "diamond":
        p([[0,-1],[.72,0],[0,1],[-.72,0]],primary,false,.9);
        p([[0,-.46],[.31,0],[0,.46],[-.31,0]],highlight,true,.6);break;
      case "scroll":
        bez([-.95,.78],[-1.0,-.85],[.78,-1.13],[.80,-.20],primary,1.0);
        bez([.80,-.20],[.82,.45],[-.42,.45],[-.28,-.03],primary,.85);
        bez([-.28,-.03],[-.10,-.35],[.25,-.18],[.17,.09],secondary,.65);
        p([[-.85,.57],[-.66,.15],[-.41,.28],[-.60,.72]],highlight,true);
        c(.70,-.20,.14,.14,highlight,true);break;
      case "fan":
        for(let i=-3;i<=3;i++){
          const a=(i+3)*Math.PI/6;
          l(0,.85,Math.cos(a)*.92,-Math.sin(a)*.92,primary,.75);
        }
        p([[-1,.76],[-1,.56],[-.54,.50],[0,.26],[.54,.5],[1,.56],[1,.76]],secondary,false,.9);
        p([[-.32,-.45],[0,-.82],[.32,-.45],[0,-.20]],highlight,true);break;
      case "crest":
        p([[0,-1],[.75,-.62],[.65,.28],[0,.96],[-.65,.28],[-.75,-.62]],primary,false,1.1);
        p([[0,-.60],[.40,-.32],[.31,.17],[0,.52],[-.31,.17],[-.40,-.32]],highlight,true);
        for(const q of [-.50,0,.50])c(q,-.87,.1,.1,secondary,true);break;
      case "triangle":
        p([[0,-1],[.95,.65],[-.95,.65]],primary,false,.85);
        p([[0,-.47],[.41,.32],[-.41,.32]],highlight,true,.6);break;
      case "chevron":
        p([[-.95,-.58],[0,.40],[.95,-.58]],primary,false,1.2,false);
        p([[-.72,.05],[0,.85],[.72,.05]],secondary,false,.7,false);break;
      case "tiles":
        p([[-.86,-.86],[.86,-.86],[.86,.86],[-.86,.86]],primary,false,.9);
        p([[-.53,-.53],[.53,-.53],[.53,.53],[-.53,.53]],highlight,false,.55);
        regular(t(0,0).x,t(0,0).y,.26*r,4,Math.PI/4,secondary,true);break;
      case "hex":
        p(Array.from({length:6},(_,i):Vec=>[Math.cos(i*TAU/6)*.9,Math.sin(i*TAU/6)*.9]),primary,false,1);
        p(Array.from({length:6},(_,i):Vec=>[Math.cos(i*TAU/6)*.48,Math.sin(i*TAU/6)*.48]),secondary,true,.5);break;
      case "weave":
        for(let i=-2;i<=2;i++){
          l(i*.38-.38,-.95,i*.38+.38,.95,i%2?primary:secondary,.95);
          l(i*.38+.38,-.95,i*.38-.38,.95,i%2?secondary:primary,.65);
        }break;
      case "eucalyptus":foliage("eucalyptus");break;
      case "olive":foliage("olive");break;
      case "ivy":foliage("ivy");break;
      case "rose":
        for(let j=0;j<5;j++)petal(j*TAU/5, j%2?secondary:primary);
        c(0,0,.32,.32,highlight,true);
        bez([-.16,.06],[-.20,-.32],[.26,-.32],[.16,.08],secondary,.7);break;
      case "blossom":case "cherry":
        for(let j=0;j<5;j++)petal(j*TAU/5,kind==="cherry"?secondary:primary);
        c(0,0,.25,.25,highlight,true);
        for(let j=0;j<5;j++){const q=j*TAU/5;c(Math.cos(q)*.23,Math.sin(q)*.23,.055,.055,primary,true);}
        break;
      case "confetti":
        p([[-.80,-.76],[-.45,-.8],[-.35,-.45],[-.72,-.35]],secondary,true);
        p([[.25,.18],[.85,.23],[.63,.85]],primary,true);
        c(.52,-.65,.19,.19,highlight,true);
        l(-.58,.56,-.13,.98,primary,1.5);break;
      case "star":star(5,.44,highlight,true);c(0,0,.17,.17,primary,true);break;
      case "heart":{
        const pts:Vec[]=[];
        for(let j=0;j<32;j++){const t0=j*TAU/32;pts.push([
          .055*Math.pow(Math.sin(t0),3)*15,
          -.057*(13*Math.cos(t0)-5*Math.cos(2*t0)-2*Math.cos(3*t0)-Math.cos(4*t0))/16]);}
        p(pts,secondary,true,.65);break;
      }
      case "flag":
        l(-.92,-.72,.92,-.72,highlight,.8);
        p([[-.70,-.68],[.64,-.68],[0,.88]],variant%2?secondary:primary,true);
        l(-.15,-.35,.15,-.35,highlight,.5);break;
      case "bulb":
        l(0,-1,0,-.63,primary,.8);
        p([[-.39,-.59],[-.49,-.05],[-.27,.54],[0,.83],[.27,.54],[.49,-.05],[.39,-.59]],secondary,true,.7);
        p([[-.28,-.60],[.28,-.60],[.28,-.48],[-.28,-.48]],highlight,true,.6);
        c(-.15,-.06,.10,.18,highlight,true);break;
      case "spark":
        star(4,.18,highlight,true);for(let j=0;j<4;j++)c(Math.cos(j*Math.PI/2)*.92,Math.sin(j*Math.PI/2)*.92,.055,.055,primary,true);
        break;
      case "holly":
        foliage("ivy",primary);
        p([[-.66,-.56],[-.19,-.68],[.07,-.97],[.27,-.61],[.72,-.43],[.22,-.20],[-.01,.30],
           [-.30,.02],[-.72,.12]],primary,true,.6);
        for(const [xx,yy] of [[.42,.34],[.68,.20],[.60,.58]])c(xx,yy,.18,.18,secondary,true);
        break;
      case "fir":
        foliage("fir",primary);
        c(.44,-.38,.15,.15,secondary,true);c(-.70,.40,.12,.12,highlight,true);break;
      case "candy":
        bez([-.4,.98],[-.4,.05],[-.7,-.92],[.27,-.89],secondary,2.2);
        bez([.27,-.89],[.86,-.83],[.80,-.23],[.37,-.23],secondary,2.2);
        for(let j=0;j<4;j++)l(-.59,.62-j*.36,-.17,.44-j*.36,highlight,1.4);
        star(4,.4,highlight,true);break;
      case "bauble":
        l(0,-1,0,-.76,highlight,.9);c(0,.03,.68,.75,secondary,true);
        p([[-.27,-.12],[.18,-.42],[.52,-.20]],highlight,false,.7,false);
        c(-.25,.22,.12,.12,highlight,true);
        p([[-.24,-.78],[.24,-.78],[.24,-.59],[-.24,-.59]],highlight,true);
        break;
      case "wreath":
        for(let j=0;j<9;j++){const a=j*TAU/9;const xx=Math.cos(a)*.72, yy=Math.sin(a)*.72;
          p([[xx,yy],[xx+Math.cos(a+.48)*.30,yy+Math.sin(a+.48)*.30],
             [xx+Math.cos(a-.48)*.28,yy+Math.sin(a-.48)*.28]],primary,true,.5);
        }
        c(.2,.66,.12,.12,secondary,true);c(-.31,.72,.13,.13,secondary,true);
        p([[-.41,-.68],[0,-.30],[.41,-.68],[0,-.53]],secondary,true);break;
      case "snow":
        for(let j=0;j<6;j++){const q=j*Math.PI/3,dx=Math.cos(q),dy=Math.sin(q);
          l(0,0,.88*dx,.88*dy,primary,.82);
          for(const a0 of [.42,.69])for(const sg of [-1,1]){
            const t0=q+sg*.60;
            l(a0*dx,a0*dy,a0*dx-.20*Math.cos(t0),a0*dy-.20*Math.sin(t0),secondary,.68);
          }
        }
        c(0,0,.13,.13,highlight,true);break;
      case "frost":
        star(8,.24,primary,false);p([[0,-.90],[.40,0],[0,.9],[-.40,0]],secondary,false,.75);
        for(let j=0;j<4;j++)c(Math.cos(j*Math.PI/2)*.76,Math.sin(j*Math.PI/2)*.76,.09,.09,highlight,true);
        break;
      case "knit":
        p([[-1,-.42],[-.55,-.9],[0,-.42],[.55,-.9],[1,-.42]],primary,false,.85,false);
        p([[-1,.35],[-.55,.85],[0,.35],[.55,.85],[1,.35]],secondary,false,.85,false);
        p([[0,-.65],[.45,0],[0,.65],[-.45,0]],highlight,true);
        break;
      case "ice":
        p([[0,-1],[.61,0],[0,1],[-.61,0]],secondary,true);
        p([[0,-.58],[.29,0],[0,.58],[-.29,0]],highlight,true);
        l(-.97,0,.97,0,primary,.6);break;
      case "palm":
        bez([-.30,1],[-.27,.37],[-.02,-.32],[.07,-.46],highlight,1.35);
        for(let j=0;j<7;j++){const a=-Math.PI+.2+j*.43;
          p([[.07,-.46],[Math.cos(a)*.50,Math.sin(a)*.52-.42],
             [Math.cos(a)*1.00,Math.sin(a)*.67-.34]],primary,true,.5);
        }
        c(.04,-.40,.13,.13,secondary,true);break;
      case "wave":
        for(const yy of [-.5,.20,.69]){
          bez([-.95,yy],[-.55,yy-.48],[-.20,yy+.42],[.13,yy],primary,.95);
          bez([.13,yy],[.50,yy-.39],[.76,yy-.35],[1,yy-.14],secondary,.65);
        }
        c(.64,-.65,.12,.12,highlight,true);break;
      case "shell":
        p([[-.84,.71],[-.94,.06],[-.76,-.48],[-.38,-.86],[0,-1],[.38,-.86],[.76,-.48],[.94,.06],[.84,.71]],secondary,true,.7);
        for(let i=-3;i<=3;i++)l(0,.71,i*.26,-.59,highlight,.7);
        p([[-.84,.71],[.84,.71]],primary,false,.7,false);break;
      case "sun":
        c(0,0,.49,.49,highlight,true);
        for(let j=0;j<12;j++){const q=j*TAU/12;
          l(Math.cos(q)*.65,Math.sin(q)*.65,Math.cos(q)*.97,Math.sin(q)*.97,primary,1.1);
        }
        c(-.12,-.12,.10,.10,secondary,true);break;
      case "hibiscus":
        for(let j=0;j<5;j++)petal(j*TAU/5,secondary);
        c(0,0,.18,.18,highlight,true);
        l(0,0,.82,.25,primary,.75);
        for(let j=0;j<3;j++)c(.48+j*.13,.12+j*.055,.07,.07,highlight,true);
        break;
      case "pumpkin":
        c(0,.15,.84,.68,primary,true);
        for(const xx of [-.44,0,.44])bez([xx,-.44],[xx-.28,.03],[xx+.22,.45],[xx,.72],secondary,.75);
        p([[-.07,-.50],[.13,-.94],[.34,-.60]],highlight,false,.95,false);
        p([[-.53,-.13],[-.29,-.30],[-.10,-.07]],highlight,true);
        p([[.18,-.07],[.37,-.30],[.58,-.13]],highlight,true);
        p([[-.36,.26],[0,.43],[.39,.26]],highlight,false,1.0,false);
        break;
      case "bat":
        p([[-1,-.36],[-.7,-.70],[-.48,-.31],[-.28,-.65],[-.10,-.22],[0,-.42],[.10,-.22],
           [.28,-.65],[.48,-.31],[.7,-.70],[1,-.36],[.73,.52],[.37,.18],[0,.57],
           [-.37,.18],[-.73,.52]],secondary,true,.65);
        for(const xx of [-.13,.13])c(xx,.02,.055,.055,highlight,true);break;
      case "web":
        for(let j=0;j<6;j++){const a=j*Math.PI/10;
          l(-.87,-.87,-.87+Math.cos(a)*1.52,-.87+Math.sin(a)*1.52,primary,.65);
        }
        for(let j=1;j<=3;j++){
          const points:Vec[]=[];
          for(let k=0;k<=8;k++){const a=k*Math.PI/2/8;points.push([-.87+j*.46*Math.cos(a),-.87+j*.46*Math.sin(a)]);}
          p(points,secondary,false,.55,false);
        }
        c(.64,.62,.12,.12,highlight,true);break;
      case "ghost":
        p([[-.65,.90],[-.70,-.09],[-.60,-.57],[-.35,-.86],[0,-.99],[.35,-.86],[.60,-.57],
           [.70,-.09],[.65,.90],[.35,.69],[.02,.96],[-.30,.69]],highlight,true,.55);
        c(-.26,-.12,.13,.16,primary,true);c(.26,-.12,.13,.16,primary,true);
        c(0,.37,.13,.19,secondary,true);break;
      case "witch":
        p([[-.97,.44],[.86,.44],[.99,.65],[-.96,.65]],primary,true);
        p([[-.40,.38],[.14,-.98],[.58,.38]],secondary,true);
        l(-.26,-.02,.34,-.02,highlight,1.1);
        star(5,.45,highlight,true);break;
      case "butterfly":
        p([[0,-.05],[-.38,-.99],[-.98,-.72],[-.66,.05],[-.90,.79],[-.30,.77],[0,.12]],secondary,true);
        p([[0,-.05],[.38,-.99],[.98,-.72],[.66,.05],[.90,.79],[.30,.77],[0,.12]],primary,true);
        l(0,-.65,0,.72,highlight,1.35);
        l(0,-.56,-.29,-.93,highlight,.65);l(0,-.56,.29,-.93,highlight,.65);
        for(const xx of [-.53,.53])c(xx,-.38,.11,.11,highlight,true);break;
      case "tulip":
        p([[-.65,-.78],[-.30,-.34],[0,-.87],[.32,-.34],[.65,-.78],[.50,.13],[0,.38],[-.50,.13]],secondary,true);
        l(0,.32,0,.98,primary,1.05);
        p([[0,.73],[-.56,.29],[-.38,.87]],primary,true);break;
      case "daisy":
        for(let j=0;j<9;j++)petal(j*TAU/9,secondary);
        c(0,0,.29,.29,highlight,true);
        c(.12,-.10,.07,.07,primary,true);break;
      case "egg":
        c(0,0,.63,.92,secondary,true);
        p([[-.56,-.14],[-.30,.10],[0,-.14],[.30,.10],[.56,-.14]],highlight,false,.95,false);
        p([[-.51,.36],[.51,.36]],primary,false,.85,false);
        for(const xx of [-.24,.24])c(xx,-.48,.10,.10,highlight,true);break;
      case "maple":
        p([[0,-1],[.21,-.51],[.60,-.79],[.56,-.33],[1,-.20],[.68,.09],[.83,.51],
           [.40,.39],[.15,.76],[0,.50],[-.15,.76],[-.40,.39],[-.83,.51],[-.68,.09],
           [-1,-.20],[-.56,-.33],[-.60,-.79],[-.21,-.51]],primary,true,.6);
        l(0,.5,0,.98,highlight,.8);break;
      case "wheat":foliage("wheat",secondary);break;
      case "acorn":
        p([[-.58,-.12],[-.54,.51],[-.18,.93],[.18,.93],[.54,.51],[.58,-.12]],secondary,true);
        p([[-.72,-.42],[-.48,-.69],[.48,-.69],[.72,-.42],[.54,-.10],[-.54,-.10]],primary,true);
        l(0,-.64,.19,-.96,highlight,.85);
        for(const xx of [-.42,0,.42])c(xx,-.34,.08,.08,highlight,true);break;
      case "mushroom":
        p([[-.25,-.03],[-.25,.84],[.26,.84],[.26,-.03]],highlight,true);
        p([[-.97,-.04],[-.69,-.61],[-.29,-.91],[.21,-1],[.66,-.66],[.97,-.04]],primary,true);
        for(const [xx,yy] of [[-.43,-.38],[.31,-.57],[.03,-.24]])c(xx,yy,.12,.12,highlight,true);
        break;
      case "falling":
        p([[0,-1],[.60,-.44],[.86,.15],[.15,.74],[-.44,.93],[-.89,.32],[-.50,-.44]],variant%2?primary:secondary,true);
        l(-.62,.56,.73,-.42,highlight,.65);
        p([[-.99,-.81],[-.67,-.99],[-.24,-.79]],primary,false,.65,false);break;
      default:star(4,.35,primary,true);break;
    }
    // Material engraving pass: reflective edges, curved veins, ridges and
    // hand-inked contours, all vector-native at any export resolution.
    // High-complexity snow crystals are intentionally left uncluttered.
    if(out.length<625){
      const light=tone(highlight,"#ffffff",.48);
      switch(kind){
        case "rose":case "blossom":case "cherry":case "daisy":case "hibiscus":{
          for(let j=0;j<5;j++){
            const a=j*TAU/5+.21;
            const q=.47;
            l(Math.cos(a)*.18,Math.sin(a)*.18,
              Math.cos(a)*q,Math.sin(a)*q,light,.26);
          }
          c(-.08,-.08,.078,.078,light,true,.25);
          break;
        }
        case "olive":case "eucalyptus":case "ivy":case "fir":case "wheat":
          c(.60,-.52,.055,.055,light,true,.25);
          break;
        case "holly":
          l(-.56,-.37,-.04,-.32,light,.34);
          l(-.10,-.38,.18,-.55,light,.30);
          c(.36,.29,.067,.075,light,true,.24);
          c(.63,.17,.055,.064,light,true,.24);
          break;
        case "maple":case "falling":
          l(0,.06,-.50,-.16,light,.35);
          l(0,.06,.43,-.22,light,.35);
          l(0,.06,-.17,.46,light,.35);
          break;
        case "palm":
          for(let j=0;j<4;j++){
            const a=-Math.PI+.2+j*.86;
            l(.06,-.46,Math.cos(a)*.74,Math.sin(a)*.55-.34,light,.30);
          }
          break;
        case "shell":
          for(let j=-2;j<=2;j++){
            const end=j*.22;
            bez([0,.59],[end*.31,-.09],[end*.82,-.65],[end,-.68],light,.28);
          }
          break;
        case "wreath":
          for(let j=0;j<5;j++){
            const a=j*TAU/5;
            c(Math.cos(a)*.70,Math.sin(a)*.70,.045,.045,light,true,.28);
          }
          break;
        case "bauble":
          c(-.19,-.29,.16,.27,light,true,.25);
          bez([-.44,.15],[-.31,.38],[-.13,.56],[.17,.59],
            tone(secondary,"#ffffff",.36),.30);
          c(.36,.37,.07,.07,light,true,.28);
          break;
        case "pumpkin":
          bez([-.62,.12],[-.47,-.13],[-.52,.42],[-.28,.58],light,.35);
          bez([.28,-.40],[.58,-.10],[.45,.34],[.24,.59],light,.35);
          l(-.12,-.56,.02,-.85,light,.32);
          break;
        case "acorn":
          for(const yy of [-.34,-.22]){
            l(-.42,yy,.42,yy,light,.33);
          }
          c(-.24,.24,.10,.11,light,true,.28);
          break;
        case "mushroom":
          bez([-.73,-.15],[-.43,-.59],[-.08,-.79],[.24,-.83],light,.45);
          l(-.10,.16,-.10,.57,tone(highlight,"#24342d",.22),.3);
          break;
        case "tulip":
          bez([-.44,-.42],[-.22,-.02],[-.06,.15],[0,.23],light,.33);
          bez([.40,-.42],[.21,-.01],[.08,.14],[0,.23],light,.33);
          break;
        case "butterfly":
          c(-.50,-.05,.095,.095,light,true,.28);
          c(.50,-.05,.095,.095,light,true,.28);
          bez([-.54,-.72],[-.76,-.50],[-.77,-.24],[-.59,-.21],light,.28);
          bez([.54,-.72],[.76,-.50],[.77,-.24],[.59,-.21],light,.28);
          break;
        case "ghost":
          bez([-.48,-.38],[-.38,-.64],[-.15,-.75],[.12,-.74],
            tone(highlight,"#ffffff",.75),.30);
          c(-.36,.25,.05,.07,light,true,.24);
          break;
        case "bat":
          l(-.73,-.33,-.49,-.15,light,.34);
          l(.73,-.33,.49,-.15,light,.34);
          c(0,.24,.07,.05,light,true,.24);
          break;
        case "web":
          l(-.67,-.68,-.38,-.41,light,.30);
          l(-.61,-.47,-.20,-.30,light,.30);
          break;
        case "candy":
          for(let j=0;j<4;j++)
            l(-.44,.61-j*.34,-.21,.55-j*.34,light,.40);
          break;
        case "witch":
          bez([-.37,.37],[-.10,.28],[.30,.28],[.63,.38],light,.38);
          l(.05,-.73,.15,-.58,light,.38);
          break;
        case "sun":
          c(-.15,-.17,.17,.18,tone(highlight,"#ffffff",.57),true,.3);
          bez([-.37,.27],[0,.46],[.19,.26],[.33,.13],secondary,.36);
          break;
        case "snow":break;
        case "knit":case "ice":case "frost":
          l(-.36,-.09,.34,-.09,light,.34);
          l(-.18,.15,.18,.15,light,.26);
          break;
        case "crest":case "diamond":case "hex":case "triangle":case "tiles":case "fan":
          l(-.24,-.27,.06,-.51,light,.33);
          l(.06,-.51,.30,-.25,light,.33);
          break;
        case "scroll":case "bracket":
          bez([-.75,.32],[-.38,-.27],[.26,-.39],[.48,-.15],light,.30);
          break;
        case "heart":
          c(-.30,-.26,.10,.07,light,true,.22);
          break;
        case "bulb":
          c(-.14,-.21,.16,.19,light,true,.28);
          break;
        case "egg":
          c(-.22,-.51,.13,.16,light,true,.28);
          break;
        case "flag":
          l(-.28,-.43,-.05,.43,light,.33);
          break;
        case "spark":case "star":case "confetti":
          c(-.08,-.20,.065,.065,light,true,.26);
          break;
        default:break;
      }
    }
  };
  // Structural treatments: each family has a distinct perimeter rhythm.
  const fine=(at:number,color?:Paint,f=.5)=>border(at,color,f);
  const lineEdge=(horizontal:boolean,fixed:number,length:number,taper=.1,col?:Paint)=>{
    const from=m+u*taper,to=length-m-u*taper;
    if(from<to){if(horizontal)line(from,fixed,to,fixed,col,.65);else line(fixed,from,fixed,to,col,.65);}
  };
  const along=(draw:(x:number,y:number,angle:number,index:number,side:number)=>void,density:number,space=.20)=>{
    for(let side=0;side<4;side++){
      const horizontal=side<2,length=horizontal?width:height;
      const fixed=side===0?m:side===1?height-m:side===2?m:width-m;
      const area=length-2*m-u*.32;
      const count=Math.max(1,Math.min(density,Math.floor(area/(u*space*spacingFactor))));
      for(let i=0;i<count;i++){
        const d=m+u*.16+(i+.5)*Math.max(0,area)/count;
        draw(horizontal?d:fixed,horizontal?fixed:d,horizontal?0:Math.PI/2,i,side);
      }
    }
  };
  const corner=(draw:(x:number,y:number,turn:number,index:number)=>void)=>{
    [[m,m,0],[width-m,m,Math.PI/2],[width-m,height-m,Math.PI],[m,height-m,3*Math.PI/2]]
      .forEach(([x,y,a],i)=>draw(x,y,a,i));
  };
  const twinkle=(x:number,y:number,r:number,color=highlight)=>{
    line(x-r,y,x+r,y,color,.65);line(x,y-r,x,y+r,color,.65);
    oval(x,y,r*.18,r*.18,color,true,.55);
  };
  // Generously curved edges and thoughtful white space keep the photo dominant.
  switch(recipe.mode){
    case "fine":
      fine(m,undefined,.53);
      corner((x,y,rot)=>glyph("dot",x,y,u*.011,rot));
      break;
    case "double":
      fine(m,undefined,1.0);fine(m+u*.038,primary,.55);
      corner((x,y,a)=>glyph(recipe.motif,x,y,u*.021,a));
      break;
    case "corners":
      fine(m+u*.022,undefined,.45);
      corner((x,y,a)=>{
        glyph(recipe.motif,x+(a===0?u*.02:a===Math.PI?-u*.02:0),
          y+(a===Math.PI/2?u*.02:a===3*Math.PI/2?-u*.02:0),
          u*(category==="Minimal"?.048:.066),a);
        const sx=(x<width/2)?1:-1,sy=(y<height/2)?1:-1;
        line(x+sx*u*.06,y+sy*u*.015,x+sx*u*.125,y+sy*u*.015,primary,.65);
        line(x+sx*u*.015,y+sy*u*.06,x+sx*u*.015,y+sy*u*.125,primary,.65);
      });
      break;
    case "beaded":
      fine(m-u*.026,undefined,.7);fine(m+u*.032,primary,.3);
      along((x,y,a,i)=>glyph(recipe.motif,x,y,u*(i%4===0?.022:.013),a,i),12,.085);
      break;
    case "deco":
      fine(m+u*.046,undefined,.65);fine(m+u*.009,primary,.35);
      corner((x,y,a)=>glyph(recipe.motif,x,y,u*.069,a));
      along((x,y,a,i)=>i%2===0?glyph(recipe.motif==="fan"?"diamond":"spark",x,y,u*.019,a,i):undefined,8,.15);
      break;
    case "lattice":
      fine(m-u*.024,undefined,.58);fine(m+u*.04,secondary,.37);
      along((x,y,a,i)=>glyph(recipe.motif,x,y,u*.032,a,i),12,.115);
      corner((x,y)=>oval(x,y,u*.013,u*.013,highlight,true,.8));
      break;
    case "garland":
      fine(m+u*.042,undefined,.5);
      lineEdge(true,m,width,.06,primary);lineEdge(true,height-m,width,.06,primary);
      lineEdge(false,m,height,.06,primary);lineEdge(false,width-m,height,.06,primary);
      along((x,y,a,i)=>{
        glyph(recipe.motif,x,y,u*.045,a+(i%2?.20:-.20),i);
        if(i%3===0)twinkle(x+Math.cos(a)*u*.064,y+Math.sin(a)*u*.064,u*.006,highlight);
      },recipe.motif==="snow"?4:recipe.motif==="daisy"?7:9,.185);
      corner((x,y,a)=>glyph(recipe.secondary??recipe.motif,x,y,u*.053,a));
      break;
    case "canopy":
      fine(m+u*.057,undefined,.50);
      along((x,y,a,i)=>{
        glyph(recipe.motif,x,y,u*.051,a+(i%2?.11:-.11),i);
        if(i%2===0)glyph(recipe.secondary??"spark",x+(a===0?u*.074:0),
          y+(a!==0?u*.074:0),u*.011,a,i);
      },recipe.motif==="fir"?5:9,.205);
      corner((x,y,a)=>glyph(recipe.secondary??recipe.motif,x,y,u*.045,a));
      break;
    case "scallop":
      fine(m+u*.05,undefined,.55);
      along((x,y,a,i)=>{
        glyph(recipe.motif,x,y,u*.042,a,i);
        const vert=a!==0,sh=(i%2?1:-1)*u*.012;
        if(vert)oval(x+sh,y,u*.007,u*.007,highlight,true);
        else oval(x,y+sh,u*.007,u*.007,highlight,true);
      },10,.175);
      corner((x,y)=>twinkle(x,y,u*.031,secondary));
      break;
    case "medallion":
      fine(m,undefined,.72);fine(m+u*.043,primary,.3);
      along((x,y,a,i)=>glyph(recipe.secondary??"spark",x,y,u*.018,a,i),7,.21);
      for(const [x,y,a] of [[width/2,m,0],[width/2,height-m,Math.PI],
        [m,height/2,-Math.PI/2],[width-m,height/2,Math.PI/2]] as const){
        glyph(recipe.motif,x,y,u*.074,a);
        twinkle(x+Math.cos(a)*u*.104,y+Math.sin(a)*u*.104,u*.009);
        twinkle(x-Math.cos(a)*u*.104,y-Math.sin(a)*u*.104,u*.009);
      }
      corner((x,y)=>oval(x,y,u*.016,u*.016,secondary,true));
      break;
  }
  // A few deliberately bespoke overlays keep the legacy patterns visually
  // distinct even when two presets share the same perimeter recipe.
  if(id==="corner-lines"||id==="open-corners"){
    const length=u*(id==="corner-lines"?.15:.21);
    corner((x,y)=>{
      const sx=x<width/2?1:-1,sy=y<height/2?1:-1;
      line(x,y,x+sx*length,y,undefined,1.2);
      line(x,y,x,y+sy*length,undefined,1.2);
    });
  }
  if(id==="deco"||id==="stately"||id==="halloween-witch"){
    corner((x,y,a)=>{
      for(let j=0;j<4;j++){
        const q=a+j*.18+.20;
        line(x+Math.cos(q)*u*.026,y+Math.sin(q)*u*.026,
          x+Math.cos(q)*u*.080,y+Math.sin(q)*u*.080,highlight,.55);
      }
    });
  }
  if(id==="party-lights"||id==="christmas-baubles"){
    along((x,y,a)=>{
      const isH=a===0;
      if(isH)line(x,y-u*.050,x,y-u*.017,primary,.6);
      else line(x-u*.050,y,x-u*.017,y,primary,.6);
    },7,.20);
  }
  // Translate after composing. Insets never change drawing fidelity or aspect.
  if(outerOffset===0)return out;
  return out.map(item=>{
    switch(item.kind){
      case "line":return {...item,x1:item.x1+outerOffset,y1:item.y1+outerOffset,
        x2:item.x2+outerOffset,y2:item.y2+outerOffset};
      case "rect":return {...item,x:item.x+outerOffset,y:item.y+outerOffset};
      case "ellipse":return {...item,cx:item.cx+outerOffset,cy:item.cy+outerOffset};
      default:return {...item,points:item.points.map(q=>({x:q.x+outerOffset,y:q.y+outerOffset}))};
    }
  });
}
