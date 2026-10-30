/**
 * Thirty original, self-contained seasonal vector designs.
 * Everything is expressed in millimeters, with bounded repeat counts.
 * No remotely hosted artwork, raster assets, fonts, requests or API calls.
 *
 * Accent colors are embedded in the vector primitives. The existing frame
 * color continues to control the border rails and any unpainted strokes.
 */
import type { FramePoint, FramePreset, FramePrimitive } from "./frames.ts";

type Season = "Christmas" | "Winter" | "Summer" | "Halloween" | "Spring" | "Autumn";
type Motif =
  | "holly" | "fir" | "candy" | "bauble" | "wreath"
  | "snow" | "frost" | "knit" | "ice" | "winter-star"
  | "palm" | "wave" | "shell" | "sun" | "hibiscus"
  | "pumpkin" | "bat" | "web" | "ghost" | "witch"
  | "cherry" | "butterfly" | "tulip" | "daisy" | "egg"
  | "maple" | "wheat" | "acorn" | "mushroom" | "falling";
type Mode = "garland" | "corners" | "double" | "lace" | "medallion";
interface SeasonalDesign extends FramePreset {
  category: Season;
  motif: Motif;
  mode: Mode;
}
const designs: readonly SeasonalDesign[] = [
  { id: "christmas-holly", name: "Holly & berries", category: "Christmas", motif: "holly", mode: "corners" },
  { id: "christmas-evergreen", name: "Evergreen garland", category: "Christmas", motif: "fir", mode: "garland" },
  { id: "christmas-candy-cane", name: "Candy cane lane", category: "Christmas", motif: "candy", mode: "double" },
  { id: "christmas-baubles", name: "Golden baubles", category: "Christmas", motif: "bauble", mode: "medallion" },
  { id: "christmas-wreaths", name: "Christmas wreaths", category: "Christmas", motif: "wreath", mode: "corners" },
  { id: "winter-snowflakes", name: "Snowflake lace", category: "Winter", motif: "snow", mode: "lace" },
  { id: "winter-frost", name: "Frost crystals", category: "Winter", motif: "frost", mode: "corners" },
  { id: "winter-nordic", name: "Nordic knit", category: "Winter", motif: "knit", mode: "double" },
  { id: "winter-ice", name: "Ice diamonds", category: "Winter", motif: "ice", mode: "medallion" },
  { id: "winter-stars", name: "Winter constellations", category: "Winter", motif: "winter-star", mode: "lace" },
  { id: "summer-palms", name: "Tropical palms", category: "Summer", motif: "palm", mode: "corners" },
  { id: "summer-waves", name: "Ocean waves", category: "Summer", motif: "wave", mode: "garland" },
  { id: "summer-seashells", name: "Seashell shore", category: "Summer", motif: "shell", mode: "medallion" },
  { id: "summer-sunshine", name: "Sunshine rays", category: "Summer", motif: "sun", mode: "lace" },
  { id: "summer-hibiscus", name: "Hibiscus bloom", category: "Summer", motif: "hibiscus", mode: "corners" },
  { id: "halloween-pumpkins", name: "Haunted pumpkins", category: "Halloween", motif: "pumpkin", mode: "medallion" },
  { id: "halloween-bats", name: "Midnight bats", category: "Halloween", motif: "bat", mode: "garland" },
  { id: "halloween-webs", name: "Spiderweb corners", category: "Halloween", motif: "web", mode: "corners" },
  { id: "halloween-ghosts", name: "Ghost parade", category: "Halloween", motif: "ghost", mode: "double" },
  { id: "halloween-witch", name: "Witching stars", category: "Halloween", motif: "witch", mode: "lace" },
  { id: "spring-cherry", name: "Cherry blossom", category: "Spring", motif: "cherry", mode: "garland" },
  { id: "spring-butterflies", name: "Meadow butterflies", category: "Spring", motif: "butterfly", mode: "corners" },
  { id: "spring-tulips", name: "Tulip garden", category: "Spring", motif: "tulip", mode: "medallion" },
  { id: "spring-daisies", name: "Daisy chain", category: "Spring", motif: "daisy", mode: "lace" },
  { id: "spring-easter-eggs", name: "Easter eggs", category: "Spring", motif: "egg", mode: "double" },
  { id: "autumn-maple", name: "Maple leaves", category: "Autumn", motif: "maple", mode: "corners" },
  { id: "autumn-wheat", name: "Harvest wheat", category: "Autumn", motif: "wheat", mode: "garland" },
  { id: "autumn-acorns", name: "Acorn woodland", category: "Autumn", motif: "acorn", mode: "medallion" },
  { id: "autumn-mushrooms", name: "Woodland mushrooms", category: "Autumn", motif: "mushroom", mode: "double" },
  { id: "autumn-foliage", name: "Falling foliage", category: "Autumn", motif: "falling", mode: "lace" },
];
export const SEASONAL_FRAME_PRESETS: readonly FramePreset[] = designs.map(({ id, name, category }) => ({ id, name, category }));
const designById = new Map(designs.map(design => [design.id, design]));
const palettes: Record<Season, readonly [string, string, string]> = {
  Christmas: ["#17734b", "#c73847", "#d1a144"],
  Winter: ["#56a5c9", "#5276ac", "#a5c7df"],
  Summer: ["#168d9d", "#e56f61", "#e7b348"],
  Halloween: ["#d57a2b", "#74519b", "#40364e"],
  Spring: ["#d67ca9", "#6a9e71", "#e2b64b"],
  Autumn: ["#be653d", "#d8a34e", "#866446"],
};

export function createSeasonalFrameGeometry(
  id: string, widthMm: number, heightMm: number, weight: number, inset: number, spacingFactor: number,
): FramePrimitive[] {
  const design = designById.get(id);
  if (!design) throw new Error("Unknown seasonal frame preset.");
  const offset = Math.min(widthMm, heightMm) * inset;
  const w = widthMm - offset * 2, h = heightMm - offset * 2;
  const unit = Math.min(w, h), margin = unit * .081;
  const stroke = unit * .0037 * weight;
  const [a, b, c] = palettes[design.category];
  const items: FramePrimitive[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, color?: string, factor = 1) =>
    items.push({ kind: "line", x1, y1, x2, y2, strokeWidth: stroke * factor, accentColor: color });
  const path = (points: FramePoint[], closed = false, fill = false, color?: string, factor = 1) =>
    items.push(closed
      ? { kind: "polygon", points, fill, strokeWidth: stroke * factor, accentColor: color }
      : { kind: "polyline", points, strokeWidth: stroke * factor, accentColor: color });
  const oval = (cx: number, cy: number, rx: number, ry: number, fill = false, color?: string, factor = 1) =>
    items.push({ kind: "ellipse", cx, cy, rx, ry, fill, strokeWidth: stroke * factor, accentColor: color });
  const rail = (m: number, color?: string, factor = .55) =>
    items.push({ kind: "rect", x: m, y: m, width: w - m * 2, height: h - m * 2,
      strokeWidth: stroke * factor, accentColor: color });
  const glyph = (type: Motif, x: number, y: number, scale = .035, rotation = 0, index = 0) => {
    const radius = scale * unit, cos = Math.cos(rotation), sin = Math.sin(rotation);
    const t = (px: number, py: number): FramePoint =>
      ({ x: x + radius * (px * cos - py * sin), y: y + radius * (px * sin + py * cos) });
    const L = (x1: number, y1: number, x2: number, y2: number, color = a, factor = .82) => {
      const p=t(x1,y1),q=t(x2,y2); line(p.x,p.y,q.x,q.y,color,factor);
    };
    const P = (coords: readonly (readonly [number,number])[], closed = false, fill = false, color = a, factor = .85) =>
      path(coords.map(([px,py])=>t(px,py)),closed,fill,color,factor);
    const C = (px: number, py: number, rx: number, ry = rx, color = a, fill = false) => {
      const q=t(px,py); oval(q.x,q.y,radius*rx,radius*ry,fill,color,.75);
    };
    const radial = (sides: number, inner: number, outer = 1, color = c, fill = false, phase = -Math.PI/2) => {
      const points: [number,number][] = [];
      for (let j=0;j<sides*2;j++){
        const phi=phase+j*Math.PI/sides,rr=(j%2 ? inner:outer);
        points.push([Math.cos(phi)*rr,Math.sin(phi)*rr]);
      }
      P(points,true,fill,color);
    };
    const petal = (angle: number, color = a) => {
      const cs=Math.cos(angle),sn=Math.sin(angle);
      const q=(px:number,py:number):[number,number]=>[px*cs-py*sn,px*sn+py*cs];
      P([q(.08,0),q(.35,-.27),q(.86,0),q(.35,.27)],true,true,color,.6);
    };
    switch(type){
      case "holly":
        P([[-.9,-.30],[-.52,-.55],[-.19,-.41],[.05,-.73],[.38,-.28],[.82,-.24],[.39,.02],
           [.65,.40],[.18,.35],[-.02,.75],[-.30,.40],[-.70,.52]],true,true,a);
        L(-.70,.15,.63,-.12,c,.7);
        C(.59,.50,.20,.20,b,true); C(.20,.69,.16,.16,b,true); C(.80,.20,.13,.13,b,true);
        break;
      case "fir":
        L(-.9,.18,.9,-.18,a,.85);
        for(let j=-3;j<=3;j++){const q=j*.23;L(q,.02,q-.23,-.55,a);L(q,.02,q+.23,.55,a);}
        C(.68,-.10,.14,.14,b,true); C(-.55,.02,.11,.11,c,true); break;
      case "candy":
        P([[-.35,.92],[-.35,-.38],[-.28,-.75],[-.05,-.87],[.20,-.78],[.36,-.54],
           [.30,-.37],[.15,-.34]],false,false,b,2.25);
        for(let j=0;j<4;j++)L(-.55,.58-j*.34,-.15,.72-j*.34,c,1.05);
        C(.23,-.66,.12,.12,a,true); break;
      case "bauble":
        C(0,.16,.67,.74,b,false); C(0,-.67,.28,.13,c,true);
        L(0,-.81,0,-.99,c,1);L(-.45,-.10,.42,.47,c,.65);
        radial(5,.45,.25,c,true); break;
      case "wreath":
        C(0,0,.73,.73,a,false);
        for(let j=0;j<8;j++){const q=j*Math.PI/4;C(Math.cos(q)*.70,Math.sin(q)*.70,.18,.12,a,true);}
        C(.33,.54,.14,.14,b,true);C(.60,.30,.11,.11,b,true);
        P([[-.25,.53],[0,.72],[.24,.53],[0,.39]],true,true,b);
        break;
      case "snow":
        for(let j=0;j<6;j++){const q=j*Math.PI/3,dx=Math.cos(q),dy=Math.sin(q);
          L(0,0,dx*.93,dy*.93,a,.94);
          for(const f of [.49,.77])for(const sg of [-1,1]){
            const theta=q+sg*.58;
            L(dx*f,dy*f,dx*f-Math.cos(theta)*.23,dy*f-Math.sin(theta)*.23,b,.65);
          }
        } C(0,0,.12,.12,c,true);break;
      case "frost":
        P([[0,-1],[.27,-.27],[1,0],[.27,.27],[0,1],[-.27,.27],[-1,0],[-.27,-.27]],true,false,a);
        P([[0,-.67],[.22,0],[0,.67],[-.22,0]],true,false,c);
        L(-.8,-.8,.8,.8,b,.65);L(-.8,.8,.8,-.8,b,.65);break;
      case "knit":
        P([[-1,-.1],[-.65,-.55],[-.32,-.1],[0,-.55],[.32,-.1],[.65,-.55],[1,-.1]],false,false,a);
        P([[-1,.32],[-.65,.78],[-.32,.32],[0,.78],[.32,.32],[.65,.78],[1,.32]],false,false,b);
        P([[0,-.30],[.3,0],[0,.3],[-.3,0]],true,true,c);break;
      case "ice":
        P([[0,-1],[.57,0],[0,1],[-.57,0]],true,false,a);
        P([[0,-.65],[.32,0],[0,.65],[-.32,0]],true,true,c);
        C(-.82,-.18,.10,.10,b,true);C(.82,.18,.10,.10,b,true);break;
      case "winter-star":
        radial(8,.27,1,a,false);
        for(let j=0;j<4;j++){const q=j*Math.PI/2;C(Math.cos(q)*1.10,Math.sin(q)*1.10,.08,.08,c,true);}
        break;
      case "palm":
        P([[-.23,.95],[-.13,.95],[.13,-.30],[.06,-.33]],true,true,c);
        for(let j=0;j<5;j++){const q=(-.8+j*.41);
          P([[.05,-.43],[Math.sin(q)*.48,-.97],[Math.sin(q)*.96,-.60],[.05,-.43]],true,true,a,.65);
        } C(.04,-.45,.13,.13,b,true);break;
      case "wave":
        for(const yy of [-.55,.20,.74])
          P([[-1,yy],[-.62,yy-.26],[-.25,yy],[.12,yy+.22],[.50,yy],[.90,yy-.22]],false,false,yy===.2?b:a,.83);
        C(.64,-.70,.14,.14,c,true);break;
      case "shell":
        P([[-.83,.62],[-.92,.12],[-.74,-.45],[-.39,-.86],[0,-1],[.39,-.86],[.74,-.45],[.92,.12],[.83,.62]],false,false,b);
        P([[-.83,.62],[.83,.62]],false,false,c);
        for(const q of [-.6,-.3,0,.3,.6])L(0,.65,q,-.75,a,.72);break;
      case "sun":
        C(0,0,.52,.52,c,true);
        for(let j=0;j<10;j++){const q=j*2*Math.PI/10;L(Math.cos(q)*.65,Math.sin(q)*.65,Math.cos(q)*1.08,Math.sin(q)*1.08,b,.94);}
        break;
      case "hibiscus":
        for(let j=0;j<5;j++)petal(j*2*Math.PI/5,b);
        C(0,0,.19,.19,c,true);L(0,0,.66,.34,c,.92);
        for(let j=0;j<3;j++)C(.40+j*.15,.17+j*.07,.07,.07,c,true);break;
      case "pumpkin":
        C(0,.2,.83,.66,b,true);
        for(const xx of [-.45,0,.45])P([[xx,-.37],[xx-.13,.14],[xx,.75]],false,false,a,.75);
        P([[-.1,-.42],[.1,-.95],[.29,-.65]],false,false,a,1.2);
        radial(3,.3,.20,c,false);break;
      case "bat":
        P([[-1,-.23],[-.78,-.57],[-.53,-.33],[-.31,-.70],[-.12,-.23],[0,-.45],[.12,-.23],
           [.31,-.70],[.53,-.33],[.78,-.57],[1,-.23],[.69,.57],[.32,.22],[0,.52],
           [-.32,.22],[-.69,.57]],true,true,c,.7);
        C(-.12,.1,.07,.07,b,true);C(.12,.1,.07,.07,b,true);break;
      case "web":
        for(let j=0;j<7;j++){const q=j*Math.PI/12;L(-.95,-.95,-.95+Math.cos(q)*1.55,-.95+Math.sin(q)*1.55,c,.55);}
        for(const rad of [.35,.65,.95]){
          const pts:[number,number][]=[];for(let j=0;j<=8;j++){const q=j*Math.PI/2/8;
            pts.push([-.95+rad*1.5*Math.cos(q),-.95+rad*1.5*Math.sin(q)]);}
          P(pts,false,false,b,.6);
        }break;
      case "ghost":
        P([[-.68,.95],[-.73,-.03],[-.65,-.58],[-.36,-.88],[0,-.97],[.36,-.88],[.65,-.58],
           [.73,-.03],[.68,.95],[.37,.68],[.09,.95],[-.20,.68],[-.45,.94]],true,true,c);
        C(-.26,-.17,.12,.16,a,true);C(.26,-.17,.12,.16,a,true);
        C(0,.37,.12,.18,b,true);break;
      case "witch":
        P([[-.88,.45],[.77,.45],[.98,.61],[-.84,.61]],true,true,c);
        P([[-.36,.40],[.18,-.99],[.54,.40]],true,true,b);
        P([[-.25,-.02],[.40,-.02]],false,false,a,1.25);
        radial(4,.30,.20,a,true);break;
      case "cherry":
        for(let j=0;j<5;j++)petal(j*2*Math.PI/5,b);
        C(0,0,.21,.21,c,true);C(.11,.09,.08,.08,a,true);break;
      case "butterfly":
        P([[0,-.1],[-.38,-.95],[-.97,-.65],[-.63,.08],[-.90,.69],[-.33,.77],[0,.15]],true,true,b);
        P([[0,-.1],[.38,-.95],[.97,-.65],[.63,.08],[.90,.69],[.33,.77],[0,.15]],true,true,a);
        L(0,-.65,0,.65,c,1.2);L(0,-.56,-.30,-.95,c);L(0,-.56,.30,-.95,c);
        break;
      case "tulip":
        P([[-.65,-.75],[-.3,-.38],[0,-.85],[.32,-.38],[.65,-.75],[.50,.12],[0,.37],[-.50,.12]],true,true,b);
        L(0,.35,0,1,a,1);P([[0,.72],[-.57,.38],[-.37,.90]],true,true,a);
        break;
      case "daisy":
        for(let j=0;j<8;j++)petal(j*Math.PI/4,a);
        C(0,0,.28,.28,c,true);C(.08,-.08,.065,.065,b,true);break;
      case "egg":
        C(0,0,.65,.92,b,false);
        P([[-.48,-.12],[-.25,.08],[0,-.12],[.25,.08],[.48,-.12]],false,false,a,1.3);
        P([[-.47,.32],[.47,.32]],false,false,c,1.2);
        C(0,-.49,.11,.11,c,true);break;
      case "maple":
        P([[0,-1],[.26,-.55],[.61,-.80],[.57,-.36],[.98,-.25],[.70,.08],[.85,.46],
           [.39,.39],[.18,.71],[0,.51],[-.18,.71],[-.39,.39],[-.85,.46],[-.70,.08],
           [-.98,-.25],[-.57,-.36],[-.61,-.80],[-.26,-.55]],true,true,a);
        L(0,.51,0,1,c,.75);break;
      case "wheat":
        L(0,.96,0,-.95,c,.85);
        for(let j=0;j<4;j++){const yy=.61-j*.42;
          P([[0,yy],[-.56,yy-.19],[-.34,yy-.56],[0,yy-.19]],true,true,c,.55);
          P([[0,yy],[.56,yy-.19],[.34,yy-.56],[0,yy-.19]],true,true,a,.55);
        }break;
      case "acorn":
        P([[-.57,-.21],[-.55,.49],[-.17,.93],[.17,.93],[.55,.49],[.57,-.21]],true,true,b);
        P([[-.68,-.38],[-.48,-.70],[.46,-.70],[.68,-.38],[.57,-.14],[-.57,-.14]],true,true,c);
        L(0,-.62,.17,-.94,a,.95);break;
      case "mushroom":
        P([[-.23,-.03],[-.23,.84],[.29,.84],[.29,-.03]],true,true,c);
        P([[-.97,-.08],[-.73,-.55],[-.35,-.88],[.15,-.98],[.61,-.78],[.94,-.08]],true,true,b);
        C(-.34,-.38,.16,.12,c,true);C(.38,-.50,.13,.13,c,true);break;
      case "falling":
        P([[0,-.98],[.57,-.43],[.88,.12],[.23,.73],[-.48,.93],[-.86,.34],[-.47,-.40]],true,true,index%2?a:b);
        L(-.62,.56,.72,-.45,c,.75);
        P([[-.98,-.80],[-.66,-.96],[-.31,-.79]],false,false,c,.7);break;
    }
  };
  // Differentiated border treatments make the motifs part of a deliberate frame,
  // not disconnected stickers. Base strokes remain controlled by the color picker.
  switch (design.mode) {
    case "garland":
      rail(margin,undefined,.57);
      rail(margin + unit*.036, a, .36);
      break;
    case "double":
      rail(margin,undefined,.83);
      rail(margin + unit*.045,c,.46);
      break;
    case "corners":
      rail(margin,undefined,.5);
      break;
    case "lace":
      rail(margin,undefined,.33);
      rail(margin+unit*.026,b,.32);
      break;
    case "medallion":
      rail(margin,undefined,.62);
      break;
  }
  const glyphScale = design.mode==="corners" ? .041 : design.mode==="lace" ? .030 : .035;
  const repeat = (horizontal: boolean, fixed: number, length: number, side: number) => {
    const maxCount = design.mode==="corners" ? 6 : 9;
    const count=Math.max(1,Math.min(maxCount,Math.floor((length-2*margin)/(unit*.205*spacingFactor))));
    for(let j=0;j<count;j++){
      const along=margin+(j+.5)*(length-2*margin)/count;
      const x=horizontal?along:fixed, y=horizontal?fixed:along;
      // The most detailed corner designs use fewer repeat motifs for visual breathing room.
      if(design.mode==="corners" && j%2===1)continue;
      const angle=horizontal ? 0 : Math.PI/2;
      glyph(design.motif,x,y,glyphScale,angle,(j+side)%3);
      if(design.mode==="lace"){
        const dx=horizontal?unit*.078:0,dy=horizontal?0:unit*.078;
        const q=unit*.006;
        oval(x+dx,y+dy,q,q,true,c,.55);
      }
    }
  };
  repeat(true,margin,w,0);
  repeat(true,h-margin,w,1);
  repeat(false,margin,h,2);
  repeat(false,w-margin,h,3);
  if(design.mode==="corners" || design.mode==="medallion"){
    const s = design.mode === "corners" ? .054 : .043;
    for(const [x,y,angle] of [
      [margin,margin,0],[w-margin,margin,Math.PI/2],
      [w-margin,h-margin,Math.PI],[margin,h-margin,Math.PI*1.5],
    ]) glyph(design.motif,x,y,s,angle,0);
  }
  // Translate only at the end: motif sizes must shrink with the inset rectangle.
  if(!offset)return items;
  return items.map(primitive => {
    switch (primitive.kind) {
      case "line": return {...primitive,x1:primitive.x1+offset,y1:primitive.y1+offset,
        x2:primitive.x2+offset,y2:primitive.y2+offset};
      case "rect": return {...primitive,x:primitive.x+offset,y:primitive.y+offset};
      case "ellipse": return {...primitive,cx:primitive.cx+offset,cy:primitive.cy+offset};
      default: return {...primitive,points:primitive.points.map(q=>({x:q.x+offset,y:q.y+offset}))};
    }
  });
}
