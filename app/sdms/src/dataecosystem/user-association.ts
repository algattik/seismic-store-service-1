// ============================================================================
// Copyright 2017-2021, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

import { Error } from '../shared';

export interface IUserAssociationSvcProvider {
   convertPrincipalIdentifierToEmail(principalIdentifier: string, dataPartitionID: string): Promise<string>;
}

export abstract class AbstractUserAssociationSvcProvider implements IUserAssociationSvcProvider {
   public abstract convertPrincipalIdentifierToEmail(principalIdentifier: string,
      dataPartitionID: string): Promise<string>;
}

export class UserAssociationFactoryBuilder {
   public static register(identifer: string) {
      return (target: any) => {
         if (UserAssociationFactoryBuilder.providers[identifer]) {
            UserAssociationFactoryBuilder.providers[identifer].push(target);
         } else {
            UserAssociationFactoryBuilder.providers[identifer] = [target];
         }
      };
   }

   public static build(identifer: string, referenceAbstraction: any, args: { [key: string]: any; } = {}) {
      if (identifer === undefined || identifer === 'unknown') {
         throw (Error.make(Error.Status.UNKNOWN,
            `Unrecognized user assocation service provider: ${identifer}`));
      }
      for (const provider of UserAssociationFactoryBuilder.providers[identifer]) {
         if (provider.prototype instanceof referenceAbstraction) {
            return new provider(args);
         }
      }
      throw (Error.make(Error.Status.UNKNOWN,
         `The user-association-service-provider builder that extend ${referenceAbstraction} has not been found`));
   }

   private static providers: { [key: string]: any[]; } = {};
}


export class UserAssocationServiceFactory extends UserAssociationFactoryBuilder {
   public static build(identifier: string): AbstractUserAssociationSvcProvider {
      return UserAssociationFactoryBuilder.build(identifier, AbstractUserAssociationSvcProvider);
   }
}