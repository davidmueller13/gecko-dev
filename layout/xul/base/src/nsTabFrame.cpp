/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License.  You may obtain a copy of the License at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.  See
 * the License for the specific language governing rights and limitations
 * under the License.
 *
 * The Original Code is Mozilla Communicator client code.
 *
 * The Initial Developer of the Original Code is Netscape Communications
 * Corporation.  Portions created by Netscape are Copyright (C) 1998
 * Netscape Communications Corporation.  All Rights Reserved.
 */

//
// Eric Vaughan
// Netscape Communications
//
// See documentation in associated header file
//

#include "nsTabFrame.h"
#include "nsIStyleContext.h"
#include "nsIPresContext.h"
#include "nsIContent.h"
#include "nsCOMPtr.h"
#include "nsHTMLIIDs.h"
#include "nsUnitConversion.h"
#include "nsINameSpaceManager.h"
#include "nsHTMLAtoms.h"
#include "nsXULAtoms.h"
#include "nsIReflowCommand.h"
#include <stdio.h>

//
// NS_NewToolbarFrame
//
// Creates a new Toolbar frame and returns it in |aNewFrame|
//
nsresult
NS_NewTabFrame ( nsIFrame** aNewFrame )
{
  NS_PRECONDITION(aNewFrame, "null OUT ptr");
  if (nsnull == aNewFrame) {
    return NS_ERROR_NULL_POINTER;
  }
  nsTabFrame* it = new nsTabFrame;
  if (nsnull == it)
    return NS_ERROR_OUT_OF_MEMORY;

  *aNewFrame = it;
  return NS_OK;
  
} // NS_NewTabFrame

void
nsTabFrame::MouseClicked(nsIPresContext* aPresContext) 
{
   // get our index
   PRInt32 index = 0;
   GetIndexInParent(mContent, index);

   // get the tab control
   nsIContent* tabcontrol = nsnull;
   GetTabControl(mContent, tabcontrol);

   // get the tab panel
   nsIContent* tabpanel = nsnull;
   GetChildWithTag(nsXULAtoms::tabpanel, tabcontrol, tabpanel);

   if (!tabpanel) {
	return;
   }

   // unselect the old tab

   // get the current index
   nsAutoString v;
   PRInt32 error;
   tabpanel->GetAttribute(kNameSpaceID_None, nsHTMLAtoms::index, v);
   PRInt32 oldIndex = v.ToInteger(&error);

   if (oldIndex != index)
   {
      // get the tab box
      nsIContent* parent;
      mContent->GetParent(parent);

      // get child
      nsIContent* child;
      parent->ChildAt(oldIndex, child);

      // set the old tab to be unselected
      child->SetAttribute(kNameSpaceID_None, nsHTMLAtoms::selected, "false", PR_TRUE);

      // set the new tab to be selected
      mContent->SetAttribute(kNameSpaceID_None, nsHTMLAtoms::selected, "true", PR_TRUE);
   }

   // set the panels index
   char value[100];
   sprintf(value, "%d", index);

   tabpanel->SetAttribute(kNameSpaceID_None, nsHTMLAtoms::index, value, PR_TRUE);

}

nsresult
nsTabFrame::GetChildWithTag(nsIAtom* atom, nsIContent* start, nsIContent*& tabpanel)
{
  // recursively search our children
  PRInt32 count = 0;
  start->ChildCount(count); 
  for (PRInt32 i = 0; i < count; i++)
  {
     nsIContent* child = nsnull;
     start->ChildAt(i,child);

     // see if it is the child
     nsCOMPtr<nsIAtom> tag;
     child->GetTag(*getter_AddRefs(tag));
     if (tag.get() == atom)
     {
       tabpanel = child;
       return NS_OK;
     }

     // recursive search the child
     nsIContent* found = nsnull;
     GetChildWithTag(atom, child, found);
     if (found != nsnull) {
       tabpanel = found;
       return NS_OK;
     }
  }

  tabpanel = nsnull;
  return NS_OK;
}

nsresult
nsTabFrame::GetTabControl(nsIContent* content, nsIContent*& tabcontrol)
{
   while(nsnull != content)
   {
      content->GetParent(content);

      if (content) {
        nsCOMPtr<nsIAtom> atom;
        if (content->GetTag(*getter_AddRefs(atom)) == NS_OK && atom.get() == nsXULAtoms::tabcontrol) {
           tabcontrol = content;
           return NS_OK;
        }
      }
   }

   tabcontrol = nsnull;
   return NS_OK;
}

nsresult
nsTabFrame::GetIndexInParent(nsIContent* content, PRInt32& index)
{
   nsIContent* parent;
   content->GetParent(parent);
   return parent->IndexOf(content, index);
}

