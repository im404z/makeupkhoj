// Labels verified against all four marketplace collections. Broad source buckets stay broad.
export type CategoryLeaf = {slug:string;name:string;labels:string[]};
export const CATEGORY_LEAVES:Record<string,CategoryLeaf[]> = {
  "lip-makeup": [
    {
      "slug": "lipstick",
      "name": "Lipstick",
      "labels": [
        "Lipstick"
      ]
    },
    {
      "slug": "liquid-lipstick",
      "name": "Liquid Lipstick",
      "labels": [
        "Liquid Lipstick"
      ]
    },
    {
      "slug": "lip-gloss",
      "name": "Lip Gloss",
      "labels": [
        "Lip Gloss"
      ]
    },
    {
      "slug": "lip-liner",
      "name": "Lip Liner",
      "labels": [
        "Lip Liner"
      ]
    },
    {
      "slug": "lip-balm",
      "name": "Lip Balm",
      "labels": [
        "Lip Balm"
      ]
    },
    {
      "slug": "lip-tint",
      "name": "Lip Tint & Stain",
      "labels": [
        "Lip Stain & Tint",
        "Lip Stain",
        "Lip Tint"
      ]
    },
    {
      "slug": "lip-plumper",
      "name": "Lip Plumper",
      "labels": [
        "Lip Plumper"
      ]
    },
    {
      "slug": "lip-crayon",
      "name": "Lip Crayon",
      "labels": [
        "Lip Crayon"
      ]
    },
    {
      "slug": "lip-primer",
      "name": "Lip Primer",
      "labels": [
        "Lip Primer"
      ]
    }
  ],
  "face-makeup": [
    {
      "slug": "foundation",
      "name": "Foundation",
      "labels": [
        "Foundation"
      ]
    },
    {
      "slug": "concealer",
      "name": "Concealer",
      "labels": [
        "Concealer"
      ]
    },
    {
      "slug": "primer",
      "name": "Primer",
      "labels": [
        "Primer",
        "Face Primer"
      ]
    },
    {
      "slug": "compact-powder",
      "name": "Compact Powder",
      "labels": [
        "Compact Powder",
        "Compact"
      ]
    },
    {
      "slug": "bb-cc-cream",
      "name": "BB & CC Cream",
      "labels": [
        "BB & CC Cream"
      ]
    },
    {
      "slug": "setting-spray",
      "name": "Setting Spray",
      "labels": [
        "Setting Spray"
      ]
    },
    {
      "slug": "loose-powder",
      "name": "Loose Powder",
      "labels": [
        "Loose Powder"
      ]
    },
    {
      "slug": "setting-sprays-and-powders",
      "name": "Setting Sprays & Powders",
      "labels": [
        "Setting Sprays & Powders"
      ]
    },
    {
      "slug": "tinted-moisturizer",
      "name": "Tinted Moisturizer",
      "labels": [
        "Tinted Moisturizer"
      ]
    },
    {
      "slug": "sindoor",
      "name": "Sindoor",
      "labels": [
        "Sindoor"
      ]
    },
    {
      "slug": "face-makeup",
      "name": "General Face Makeup",
      "labels": [
        "Face Makeup"
      ]
    }
  ],
  "eye-makeup": [
    {
      "slug": "eyeliner",
      "name": "Eyeliner",
      "labels": [
        "Eyeliner"
      ]
    },
    {
      "slug": "mascara",
      "name": "Mascara",
      "labels": [
        "Mascara"
      ]
    },
    {
      "slug": "kajal",
      "name": "Kajal",
      "labels": [
        "Kajal"
      ]
    },
    {
      "slug": "eyeshadow",
      "name": "Eyeshadow",
      "labels": [
        "Eyeshadow",
        "Eye Shadow"
      ]
    },
    {
      "slug": "eyebrow-pencil",
      "name": "Eyebrow Products",
      "labels": [
        "Eyebrows",
        "Eye Brow Enhancers"
      ]
    },
    {
      "slug": "false-eyelashes",
      "name": "False Eyelashes",
      "labels": [
        "False Eyelashes"
      ]
    },
    {
      "slug": "eye-concealer",
      "name": "Eye Concealer",
      "labels": [
        "Eye Concealer",
        "Under Eye Concealer"
      ]
    },
    {
      "slug": "eye-primer",
      "name": "Eye Primer",
      "labels": [
        "Eye Primer"
      ]
    },
    {
      "slug": "eye-makeup",
      "name": "General Eye Makeup",
      "labels": [
        "Eye Makeup"
      ]
    }
  ],
  "cheeks": [
    {
      "slug": "blush",
      "name": "Blush",
      "labels": [
        "Blush"
      ]
    },
    {
      "slug": "highlighter",
      "name": "Highlighter",
      "labels": [
        "Highlighter",
        "Highlighters"
      ]
    },
    {
      "slug": "bronzer",
      "name": "Bronzer",
      "labels": [
        "Bronzer"
      ]
    },
    {
      "slug": "contour",
      "name": "Contour",
      "labels": [
        "Contour"
      ]
    }
  ],
  "makeup-kits": [
    {
      "slug": "makeup-kits",
      "name": "Makeup Kits",
      "labels": [
        "Makeup Kits"
      ]
    },
    {
      "slug": "combo-packs",
      "name": "Makeup Combos",
      "labels": [
        "Kits & Combos",
        "Makeup Combos"
      ]
    },
    {
      "slug": "makeup-palettes",
      "name": "Makeup Palettes",
      "labels": [
        "Multi-Functional Makeup Palettes"
      ]
    }
  ],
  "tools-and-brushes": [
    {
      "slug": "brushes-and-tools",
      "name": "Brushes & Tools",
      "labels": [
        "Brushes & Tools"
      ]
    },
    {
      "slug": "makeup-sponge",
      "name": "Sponges & Applicators",
      "labels": [
        "Sponges & Applicators"
      ]
    },
    {
      "slug": "cotton-buds-and-balls",
      "name": "Cotton Buds & Balls",
      "labels": [
        "Cotton Buds & Balls"
      ]
    }
  ],
  "nails": [
    {
      "slug": "nail-polish",
      "name": "Nail Polish",
      "labels": [
        "Nail Polish"
      ]
    },
    {
      "slug": "nail-care",
      "name": "Nail Care",
      "labels": [
        "Nail Care"
      ]
    },
    {
      "slug": "manicure-pedicure-kits",
      "name": "Manicure & Pedicure Kits",
      "labels": [
        "Manicure Pedicure Kits"
      ]
    }
  ],
  "makeup-remover": [
    {
      "slug": "makeup-remover",
      "name": "Makeup Remover",
      "labels": [
        "Makeup Remover"
      ]
    },
    {
      "slug": "micellar-water",
      "name": "Micellar Water",
      "labels": [
        "Micellar Water"
      ]
    },
    {
      "slug": "cleansing-balm",
      "name": "Cleansing Oils & Balm",
      "labels": [
        "Cleansing Oils & Balm"
      ]
    },
    {
      "slug": "makeup-wipes",
      "name": "Face Wipes",
      "labels": [
        "Face Wipes"
      ]
    },
    {
      "slug": "eye-lip-remover",
      "name": "Eye Makeup Remover",
      "labels": [
        "Eye Makeup Remover"
      ]
    }
  ]
};
export function categoryLeafMatch(category:string,sub?:string){
 const groups=CATEGORY_LEAVES[category]||[];
 const labels=(sub?groups.filter(group=>group.slug===sub):groups).flatMap(group=>group.labels);
 return {sub_sub_category:{$in:labels.map(label=>new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i'))}};
}
