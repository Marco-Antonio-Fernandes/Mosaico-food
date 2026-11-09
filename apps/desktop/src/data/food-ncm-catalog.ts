import type { NcmOption } from "@/data/ncm-catalog";

/**
 * Product classifications approved for the food catalog flow.
 * Keep this list intentionally small: the assistant must not suggest unrelated
 * NCMs from the complete government catalog.
 */
export const FOOD_NCM_CATALOG: NcmOption[] = [
  { code: "19059090", description: "Pão francês" },
  { code: "19059010", description: "Pão de forma" },
  { code: "19059090", description: "Pão de hambúrguer / hot dog" },
  { code: "19059090", description: "Pão doce, rosca, sonho, folhado" },
  { code: "19059090", description: "Pão de queijo (assado na hora)" },
  { code: "19012000", description: "Pão de queijo congelado comprado pronto" },
  { code: "19059090", description: "Pastel frito (carne, queijo, pizza...)" },
  { code: "19059090", description: "Coxinha, risole, bolinha de queijo" },
  { code: "19059090", description: "Esfiha, empada, enroladinho, joelho" },
  { code: "19022000", description: "Pastel congelado cru, comprado pronto" },
  { code: "19059090", description: "Bolo, torta doce, rosquinha" },
  { code: "18069000", description: "Brigadeiro" },
  { code: "19019020", description: "Doce de leite" },
  { code: "20081100", description: "Paçoca" },
  { code: "17049090", description: "Bala e confeitos" },
  { code: "22021000", description: "Refrigerante lata/garrafa" },
  { code: "22011000", description: "Água mineral" },
];
