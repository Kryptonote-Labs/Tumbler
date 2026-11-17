import { expect,test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { createPresentation,applyPresentationCommand,openPresentationArtifact } from '../src/index.ts';

test('LibreOffice container metadata may share an id with a shape without making shape targets ambiguous',()=>{
  let artifact=createPresentation();
  const slideId=artifact.document.slides[0]!.id;
  artifact=applyPresentationCommand(artifact,{name:'insert-object',slideId,bounds:{x:100,y:100,width:100,height:100},object:{kind:'shape',geometry:'rect',text:'Shape'}});
  const slide=artifact.document.slides[0]!,shape=slide.objects[0]!;
  const part=artifact.document.package.getPart(slide.part)!;
  const original=new TextDecoder().decode(artifact.document.package.readPart(part));
  const bytes=new TextEncoder().encode(original.replace('<p:cNvPr id="1" name=""',`<p:cNvPr id="${shape.shapeId}" name=""`));
  const transaction=beginPackageTransaction(artifact.document.package);
  transaction.replacePart(slide.part,bytes);
  const imported=openPresentationArtifact(transaction.commit());
  expect(imported.document.slides[0]!.objects).toHaveLength(1);
  expect(imported.document.slides[0]!.objects[0]!.shapeId).toBe(shape.shapeId);
});
